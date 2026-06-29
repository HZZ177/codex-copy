from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

import httpx
from langchain_core.callbacks import AsyncCallbackHandler

from backend.app.agent.context_compression_utils import (
    CompressionMaterial,
    render_messages_for_compression_input,
)
from backend.app.agent.factory import AgentFactory, agent_factory, pop_llm_gateway_trace_id
from backend.app.agent.side_task_model import SideTaskLLM, SideTaskModelError, create_side_task_llm
from backend.app.core.ids import new_id
from backend.app.core.logger import logger
from backend.app.services.context_compression_prompt_builder import build_l1_prompt, build_l2_prompt
from backend.app.storage import StorageRepositories


@dataclass(slots=True)
class CompressionGenerationResult:
    success: bool
    phase: str
    new_l1_content: str | None = None
    new_l2_content: str | None = None
    failure_reason: str | None = None


@dataclass(frozen=True)
class ContextCompressionOutcome:
    status: str
    reason: str | None = None
    target_session_id: str | None = None
    token_count: int = 0
    context_window_tokens: int = 0
    fraction: float = 0.0


class _TokenUsageCaptureHandler(AsyncCallbackHandler):
    def __init__(self) -> None:
        self.run_id: str | None = None
        self.token_usage = {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "cache_read_tokens": 0,
        }

    async def on_chat_model_start(
        self,
        serialized,
        messages,
        *,
        run_id,
        parent_run_id=None,
        tags=None,
        metadata=None,
        **kwargs,
    ) -> None:
        self.run_id = str(run_id) if run_id else None

    async def on_llm_end(self, response, **kwargs) -> None:
        usage = _response_usage(response)
        if usage:
            self.token_usage = _extract_token_usage_from_metadata(usage)


class ContextCompressionService:
    """只负责调用快速模型生成 L1/L2 压缩正文。

    会话派生、检查点克隆、压缩暂存和消息替换都由中间件处理；
    这里保持和基座一致的职责边界，避免 service 直接改写主对话状态。
    """

    def __init__(
        self,
        repositories: StorageRepositories,
        *,
        factory: AgentFactory = agent_factory,
        http_transport: httpx.BaseTransport | httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.repositories = repositories
        self.factory = factory
        self.http_transport = http_transport

    async def generate_compression_result(
        self,
        *,
        material: CompressionMaterial,
    ) -> CompressionGenerationResult:
        try:
            side_task = create_side_task_llm(
                self.repositories,
                factory=self.factory,
                http_transport=self.http_transport,
                temperature=0.3,
                max_tokens=2000,
            )
        except SideTaskModelError as exc:
            logger.warning(
                "[ContextCompressionService] 获取快速模型配置失败 | "
                f"配置范围={exc.scope} | 错误={exc}"
            )
            return CompressionGenerationResult(
                success=False,
                phase=material.phase,
                failure_reason=f"model_config_error:{exc}",
            )

        try:
            if material.phase == "initial":
                new_l1 = await self._generate_l1(side_task, material)
                if not new_l1:
                    return CompressionGenerationResult(
                        success=False,
                        phase=material.phase,
                        failure_reason="empty_l1_output",
                    )
                return CompressionGenerationResult(
                    success=True,
                    phase=material.phase,
                    new_l1_content=new_l1,
                )

            new_l2, new_l1 = await asyncio.gather(
                self._generate_l2(side_task, material),
                self._generate_l1(side_task, material),
                return_exceptions=True,
            )
            for item in (new_l2, new_l1):
                if isinstance(item, Exception):
                    raise item
            if not new_l1:
                return CompressionGenerationResult(
                    success=False,
                    phase=material.phase,
                    failure_reason="empty_l1_output",
                )
            if not new_l2:
                return CompressionGenerationResult(
                    success=False,
                    phase=material.phase,
                    failure_reason="empty_l2_output",
                )
            return CompressionGenerationResult(
                success=True,
                phase=material.phase,
                new_l1_content=str(new_l1),
                new_l2_content=str(new_l2),
            )
        except Exception as exc:
            logger.opt(exception=True).warning(
                f"[ContextCompressionService] 压缩生成失败 | 阶段={material.phase} | 错误={exc}"
            )
            return CompressionGenerationResult(
                success=False,
                phase=material.phase,
                failure_reason=f"llm_error:{exc}",
            )

    async def _generate_l1(
        self, side_task: SideTaskLLM, material: CompressionMaterial
    ) -> str | None:
        raw_messages_text = render_messages_for_compression_input(
            material.compression_zone_messages
        )
        if not raw_messages_text.strip():
            return None
        prompt = build_l1_prompt(raw_messages_text)
        return await self._invoke_compression_llm(
            side_task=side_task,
            material=material,
            level="l1",
            prompt_messages=[prompt.system_message, prompt.human_message],
        )

    async def _generate_l2(
        self, side_task: SideTaskLLM, material: CompressionMaterial
    ) -> str | None:
        existing_l1_text = (material.existing_l1_content or "").strip()
        if not existing_l1_text:
            return None
        prompt = build_l2_prompt(existing_l1_text)
        return await self._invoke_compression_llm(
            side_task=side_task,
            material=material,
            level="l2",
            prompt_messages=[prompt.system_message, prompt.human_message],
        )

    async def _invoke_compression_llm(
        self,
        *,
        side_task: SideTaskLLM,
        material: CompressionMaterial,
        level: str,
        prompt_messages: list[Any],
    ) -> str | None:
        request_id = new_id()
        started_at = time.perf_counter()
        started_at_ms = int(time.time() * 1000)
        trace_id = str(material.trace_id or "")
        trace_record_id = str(material.trace_record_id or trace_id)
        session_id = str(material.original_session_id or material.active_session_id or "")
        capture = _TokenUsageCaptureHandler()
        gateway_trace_id: str | None = None
        request_preview = _preview_messages(prompt_messages)
        if trace_id and trace_record_id and session_id:
            self._start_request_log(
                request_id=request_id,
                trace_id=trace_id,
                trace_record_id=trace_record_id,
                session_id=session_id,
                active_session_id=material.active_session_id,
                side_task=side_task,
                request_preview=request_preview,
                level=level,
                material=material,
            )
            self._append_side_event(
                trace_id=trace_id,
                trace_record_id=trace_record_id,
                event_type="context_compression.llm",
                status="running",
                side_event_id=request_id,
                material=material,
                level=level,
                model=side_task.model,
                input_data={"messages": request_preview},
                started_at_ms=started_at_ms,
            )
        try:
            response = await side_task.llm.ainvoke(
                prompt_messages,
                config={"callbacks": [capture]},
            )
            if capture.run_id:
                gateway_trace_id = pop_llm_gateway_trace_id(capture.run_id)
            usage = _extract_token_usage(response, capture.token_usage)
            output_text = _clean_generated_text(getattr(response, "content", response))
            if trace_id and trace_record_id and session_id:
                self._finish_request_log(
                    request_id=request_id,
                    response_preview=output_text or "",
                    duration_ms=_duration_ms(started_at),
                    usage=usage,
                    gateway_trace_id=gateway_trace_id,
                )
                self._append_side_event(
                    trace_id=trace_id,
                    trace_record_id=trace_record_id,
                    event_type="context_compression.llm",
                    status="completed" if output_text else "failed",
                    side_event_id=request_id,
                    material=material,
                    level=level,
                    model=side_task.model,
                    output_data={"content": output_text or ""},
                    usage=usage,
                    gateway_trace_id=gateway_trace_id,
                    started_at_ms=started_at_ms,
                    error=None
                    if output_text
                    else {"type": "ValueError", "message": "empty_output"},
                )
            return output_text
        except Exception as exc:
            if capture.run_id:
                gateway_trace_id = pop_llm_gateway_trace_id(capture.run_id)
            if trace_id and trace_record_id and session_id:
                self._fail_request_log(
                    request_id=request_id,
                    response_preview="",
                    duration_ms=_duration_ms(started_at),
                    error_message=str(exc),
                    gateway_trace_id=gateway_trace_id,
                )
                self._append_side_event(
                    trace_id=trace_id,
                    trace_record_id=trace_record_id,
                    event_type="context_compression.llm",
                    status="failed",
                    side_event_id=request_id,
                    material=material,
                    level=level,
                    model=side_task.model,
                    gateway_trace_id=gateway_trace_id,
                    started_at_ms=started_at_ms,
                    error={"type": type(exc).__name__, "message": str(exc)},
                )
            raise

    def _start_request_log(
        self,
        *,
        request_id: str,
        trace_id: str,
        trace_record_id: str,
        session_id: str,
        active_session_id: str | None,
        side_task: SideTaskLLM,
        request_preview: str,
        level: str,
        material: CompressionMaterial,
    ) -> None:
        try:
            self.repositories.llm_request_logs.start(
                request_id=request_id,
                trace_id=trace_id,
                trace_record_id=trace_record_id,
                session_id=session_id,
                active_session_id=active_session_id,
                provider_id=side_task.provider_id,
                provider_name=side_task.provider_name,
                model=side_task.model,
                request_preview=request_preview,
                metadata={
                    "domain": "context_compression",
                    "compression_level": level,
                    "phase": material.phase,
                    "anchor_message_id": material.anchor_message_id,
                    **(material.side_event_metadata or {}),
                },
            )
        except Exception as exc:
            logger.debug(f"[ContextCompressionService] 压缩请求日志开始失败 | 错误={exc}")

    def _finish_request_log(
        self,
        *,
        request_id: str,
        response_preview: str,
        duration_ms: int,
        usage: dict[str, int],
        gateway_trace_id: str | None,
    ) -> None:
        try:
            self.repositories.llm_request_logs.finish(
                request_id,
                input_tokens=usage["input_tokens"],
                cache_read_tokens=usage["cache_read_tokens"],
                output_tokens=usage["output_tokens"],
                total_tokens=usage["total_tokens"] or None,
                response_preview=response_preview,
                duration_ms=duration_ms,
                gateway_trace_id=gateway_trace_id,
            )
        except Exception as exc:
            logger.debug(f"[ContextCompressionService] 压缩请求日志完成失败 | 错误={exc}")

    def _fail_request_log(
        self,
        *,
        request_id: str,
        response_preview: str,
        duration_ms: int,
        error_message: str,
        gateway_trace_id: str | None,
    ) -> None:
        try:
            self.repositories.llm_request_logs.fail(
                request_id,
                error_message=error_message,
                response_preview=response_preview,
                duration_ms=duration_ms,
                gateway_trace_id=gateway_trace_id,
            )
        except Exception as exc:
            logger.debug(f"[ContextCompressionService] 压缩请求日志失败记录失败 | 错误={exc}")

    def _append_side_event(
        self,
        *,
        trace_id: str,
        trace_record_id: str,
        event_type: str,
        status: str,
        side_event_id: str,
        material: CompressionMaterial,
        level: str,
        model: str,
        input_data: Any | None = None,
        output_data: Any | None = None,
        usage: dict[str, int] | None = None,
        gateway_trace_id: str | None = None,
        started_at_ms: int | None = None,
        error: dict[str, str] | None = None,
    ) -> None:
        token_usage = usage or {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "cache_read_tokens": 0,
        }
        payload = {
            "side_event_id": side_event_id,
            "event_type": event_type,
            "status": status,
            "name": model,
            "session_id": material.original_session_id,
            "active_session_id": material.active_session_id,
            "input_data": input_data,
            "output_data": output_data,
            "error": error,
            "input_tokens": token_usage["input_tokens"],
            "cache_read_tokens": token_usage["cache_read_tokens"],
            "output_tokens": token_usage["output_tokens"],
            "total_tokens": token_usage["total_tokens"],
            "metadata": {
                "domain": "context_compression",
                "compression_level": level,
                "phase": material.phase,
                "anchor_message_id": material.anchor_message_id,
                "gateway_trace_id": gateway_trace_id,
                "started_at_ms": started_at_ms,
                **(material.side_event_metadata or {}),
            },
        }
        try:
            self.repositories.trace_event_logs.append(
                trace_id=trace_id,
                trace_record_id=trace_record_id,
                event_type=event_type,
                source="context_compression_service",
                idempotency_key=f"{side_event_id}:{status}",
                timestamp_ms=int(time.time() * 1000),
                payload=payload,
                original_session_id=material.original_session_id,
                active_session_id=material.active_session_id,
                tags={"domain": "context_compression", "status": status},
            )
        except Exception as exc:
            logger.debug(f"[ContextCompressionService] 压缩旁路事件记录失败 | 错误={exc}")


def _duration_ms(started_at: float) -> int:
    return max(0, int((time.perf_counter() - started_at) * 1000))


def _preview_messages(messages: list[Any]) -> str:
    parts: list[str] = []
    for message in messages:
        role = type(message).__name__
        content = str(getattr(message, "content", message) or "")
        parts.append(f"[{role}]\n{content}")
    text = "\n\n".join(parts)
    return text if len(text) <= 4000 else f"{text[:4000]}..."


def _response_usage(response: Any) -> Any:
    usage = getattr(response, "usage_metadata", None)
    if usage:
        return usage
    if isinstance(response, dict):
        return response.get("usage_metadata")
    generations = getattr(response, "generations", None)
    if generations:
        for generation_list in generations:
            for generation in generation_list:
                message = getattr(generation, "message", None)
                usage = getattr(message, "usage_metadata", None)
                if usage:
                    return usage
    return None


def _extract_token_usage(response: Any, fallback: dict[str, int] | None = None) -> dict[str, int]:
    usage = _response_usage(response)
    if usage:
        return _extract_token_usage_from_metadata(usage)
    return fallback or {
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "cache_read_tokens": 0,
    }


def _extract_token_usage_from_metadata(usage: Any) -> dict[str, int]:
    if isinstance(usage, dict):
        details = usage.get("input_token_details") or {}
        return {
            "input_tokens": int(usage.get("input_tokens", 0) or 0),
            "output_tokens": int(usage.get("output_tokens", 0) or 0),
            "total_tokens": int(usage.get("total_tokens", 0) or 0),
            "cache_read_tokens": int(details.get("cache_read", 0) or 0)
            if isinstance(details, dict)
            else 0,
        }
    details = getattr(usage, "input_token_details", None)
    cache_read_tokens = 0
    if isinstance(details, dict):
        cache_read_tokens = int(details.get("cache_read", 0) or 0)
    elif details is not None:
        cache_read_tokens = int(getattr(details, "cache_read", 0) or 0)
    return {
        "input_tokens": int(getattr(usage, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(usage, "output_tokens", 0) or 0),
        "total_tokens": int(getattr(usage, "total_tokens", 0) or 0),
        "cache_read_tokens": cache_read_tokens,
    }


def _clean_generated_text(content: Any) -> str | None:
    if isinstance(content, str):
        text = content.strip()
    elif isinstance(content, list):
        text = "".join(
            str(item.get("text") or "") for item in content if isinstance(item, dict)
        ).strip()
    else:
        text = str(content).strip() if content is not None else ""
    if not text:
        return None
    for token in (
        "<context_compression:l1>",
        "</context_compression:l1>",
        "<context_compression:l2>",
        "</context_compression:l2>",
    ):
        text = text.replace(token, "")
    cleaned = text.strip()
    return cleaned or None
