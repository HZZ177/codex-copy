from __future__ import annotations

import asyncio
import threading
import time
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from typing import Any

import httpx
from langchain.agents import create_agent
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import PrivateAttr

from backend.app.core.ids import new_id
from backend.app.core.logger import logger
from backend.app.core.request_context import (
    get_active_session_id,
    get_session_id,
    get_trace_id,
    get_turn_index,
    get_user_id,
)
from backend.app.model import ModelSettings

_llm_gateway_trace_registry: dict[str, str] = {}


def register_llm_gateway_trace_id(run_id: str, gateway_trace_id: str) -> None:
    if run_id and gateway_trace_id:
        _llm_gateway_trace_registry[run_id] = gateway_trace_id


def get_llm_gateway_trace_id(run_id: str) -> str | None:
    if not run_id:
        return None
    return _llm_gateway_trace_registry.get(run_id)


def ensure_llm_gateway_trace_id(run_id: str) -> str | None:
    if not run_id:
        return None
    gateway_trace_id = _llm_gateway_trace_registry.get(run_id)
    if gateway_trace_id:
        return gateway_trace_id
    gateway_trace_id = new_id()
    _llm_gateway_trace_registry[run_id] = gateway_trace_id
    return gateway_trace_id


def pop_llm_gateway_trace_id(run_id: str) -> str | None:
    if not run_id:
        return None
    return _llm_gateway_trace_registry.pop(run_id, None)


@dataclass(slots=True)
class _LLMRequestLogContext:
    request_id: str
    run_id: str
    started_at: float
    gateway_thread_id: str | None
    gateway_trace_id: str | None


class PatchedChatOpenAI(ChatOpenAI):
    """ChatOpenAI with gateway trace headers and streaming usage de-duplication."""

    _llm_request_logs: Any = PrivateAttr(default=None)
    _llm_provider_id: str | None = PrivateAttr(default=None)
    _llm_provider_name: str | None = PrivateAttr(default=None)

    def __init__(
        self,
        *args: Any,
        llm_request_logs: Any = None,
        provider_id: str | None = None,
        provider_name: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._llm_request_logs = llm_request_logs
        self._llm_provider_id = provider_id
        self._llm_provider_name = provider_name

    @staticmethod
    def _get_gateway_trace_id_from_kwargs(kwargs: dict[str, Any]) -> str | None:
        extra_headers = kwargs.get("extra_headers")
        if not isinstance(extra_headers, dict):
            return None
        value = extra_headers.get("AH-Trace-Id")
        return str(value) if value else None

    @classmethod
    def _resolve_gateway_trace_id(cls, run_id: str, kwargs: dict[str, Any]) -> str:
        gateway_trace_id = (
            cls._get_gateway_trace_id_from_kwargs(kwargs)
            or ensure_llm_gateway_trace_id(run_id)
            or new_id()
        )
        if run_id and not get_llm_gateway_trace_id(run_id):
            register_llm_gateway_trace_id(run_id, gateway_trace_id)
        return gateway_trace_id

    @staticmethod
    def _inject_gateway_headers(kwargs: dict[str, Any], gateway_trace_id: str) -> dict[str, Any]:
        gateway_thread_id = get_trace_id()
        extra_headers = dict(kwargs.get("extra_headers") or {})
        if gateway_thread_id:
            extra_headers["AH-Thread-Id"] = gateway_thread_id
        extra_headers["AH-Trace-Id"] = gateway_trace_id
        kwargs["extra_headers"] = extra_headers
        logger.debug(
            f"[LLM] 注入网关追踪头 | AH-Thread-Id={gateway_thread_id or '-'} | "
            f"AH-Trace-Id={gateway_trace_id}"
        )
        return kwargs

    def _start_request_log(
        self,
        *,
        run_id: str,
        gateway_trace_id: str,
        messages: list[Any],
        call_kind: str,
    ) -> _LLMRequestLogContext | None:
        if self._llm_request_logs is None:
            return None
        trace_id = get_trace_id()
        session_id = get_session_id()
        if not trace_id or not session_id:
            return None
        gateway_thread_id = trace_id or None
        request_id = run_id or gateway_trace_id or new_id()
        context = _LLMRequestLogContext(
            request_id=request_id,
            run_id=run_id,
            started_at=time.perf_counter(),
            gateway_thread_id=gateway_thread_id,
            gateway_trace_id=gateway_trace_id,
        )
        try:
            self._llm_request_logs.start(
                request_id=request_id,
                trace_id=trace_id,
                trace_record_id=trace_id,
                session_id=session_id,
                active_session_id=get_active_session_id() or session_id,
                gateway_thread_id=gateway_thread_id,
                gateway_trace_id=gateway_trace_id,
                turn_index=get_turn_index(),
                provider_id=self._llm_provider_id,
                provider_name=self._llm_provider_name or self.__class__.__name__,
                model=_model_name(self),
                request_preview=_preview_value(messages),
                metadata={
                    "run_id": run_id,
                    "call_kind": call_kind,
                    "logging_source": "patched_chat_openai",
                    "user_id": get_user_id() or None,
                },
            )
        except Exception as exc:
            logger.debug(f"[LLMRequestLog] 请求日志开始失败 | run_id={run_id} | 错误={exc}")
            return None
        return context

    def _finish_request_log(
        self,
        context: _LLMRequestLogContext | None,
        *,
        response: Any,
        response_preview: str | None = None,
        usage: dict[str, int] | None = None,
    ) -> None:
        if self._llm_request_logs is None or context is None:
            return
        resolved_usage = usage or _extract_token_usage(response)
        try:
            self._llm_request_logs.finish(
                context.request_id,
                input_tokens=resolved_usage["input_tokens"],
                cache_read_tokens=resolved_usage["cache_read_tokens"],
                output_tokens=resolved_usage["output_tokens"],
                total_tokens=resolved_usage["total_tokens"] or None,
                response_preview=response_preview
                if response_preview is not None
                else _response_preview(response),
                duration_ms=_duration_ms(context.started_at),
                gateway_thread_id=context.gateway_thread_id,
                gateway_trace_id=context.gateway_trace_id,
            )
        except Exception as exc:
            logger.debug(
                f"[LLMRequestLog] 请求日志完成失败 | request_id={context.request_id} | 错误={exc}"
            )

    def _fail_request_log(
        self,
        context: _LLMRequestLogContext | None,
        *,
        error: BaseException,
        response_preview: str | None = None,
    ) -> None:
        if self._llm_request_logs is None or context is None:
            return
        try:
            self._llm_request_logs.fail(
                context.request_id,
                error_message=str(error) or type(error).__name__,
                response_preview=response_preview,
                duration_ms=_duration_ms(context.started_at),
                gateway_thread_id=context.gateway_thread_id,
                gateway_trace_id=context.gateway_trace_id,
            )
        except Exception as exc:
            logger.debug(
                f"[LLMRequestLog] 请求日志失败记录失败 | "
                f"request_id={context.request_id} | 错误={exc}"
            )

    def _cancel_request_log(
        self,
        context: _LLMRequestLogContext | None,
        *,
        error: BaseException,
        response_preview: str | None = None,
    ) -> None:
        if self._llm_request_logs is None or context is None:
            return
        try:
            self._llm_request_logs.cancel(
                context.request_id,
                error_message=str(error) or type(error).__name__,
                response_preview=response_preview,
                duration_ms=_duration_ms(context.started_at),
                gateway_thread_id=context.gateway_thread_id,
                gateway_trace_id=context.gateway_trace_id,
            )
        except Exception as exc:
            logger.debug(
                f"[LLMRequestLog] 请求日志取消记录失败 | "
                f"request_id={context.request_id} | 错误={exc}"
            )

    async def _agenerate_with_cache(
        self,
        messages: list[Any],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> Any:
        run_id = str(getattr(run_manager, "run_id", "") or "")
        resolved_kwargs = dict(kwargs)
        gateway_trace_id = self._resolve_gateway_trace_id(run_id, resolved_kwargs)
        kwargs = self._inject_gateway_headers(resolved_kwargs, gateway_trace_id)
        try:
            return await super()._agenerate_with_cache(
                messages,
                stop=stop,
                run_manager=run_manager,
                **kwargs,
            )
        except BaseException as exc:
            if isinstance(exc, (asyncio.CancelledError, GeneratorExit)):
                logger.info(
                    f"[LLM] agenerate_with_cache 已取消 | run_id={run_id} | "
                    f"gateway_trace_id={gateway_trace_id} | error={type(exc).__name__}"
                )
            else:
                logger.opt(exception=True).error(
                    f"[LLM] agenerate_with_cache 失败 | run_id={run_id} | "
                    f"gateway_trace_id={gateway_trace_id}"
                )
            raise
        finally:
            pop_llm_gateway_trace_id(run_id)

    async def _agenerate(
        self,
        messages: list[Any],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> Any:
        run_id = str(getattr(run_manager, "run_id", "") or "")
        resolved_kwargs = dict(kwargs)
        gateway_trace_id = self._resolve_gateway_trace_id(run_id, resolved_kwargs)
        kwargs = self._inject_gateway_headers(resolved_kwargs, gateway_trace_id)
        request_log = self._start_request_log(
            run_id=run_id,
            gateway_trace_id=gateway_trace_id,
            messages=messages,
            call_kind="agenerate",
        )
        try:
            result = await super()._agenerate(
                messages,
                stop=stop,
                run_manager=run_manager,
                **kwargs,
            )
        except (asyncio.CancelledError, GeneratorExit) as exc:
            self._cancel_request_log(request_log, error=exc)
            logger.info(
                f"[LLM] agenerate 已取消 | run_id={run_id} | "
                f"gateway_trace_id={gateway_trace_id} | error={type(exc).__name__}"
            )
            raise
        except BaseException as exc:
            self._fail_request_log(request_log, error=exc)
            logger.opt(exception=True).error(
                f"[LLM] agenerate 失败 | run_id={run_id} | gateway_trace_id={gateway_trace_id}"
            )
            raise
        else:
            self._finish_request_log(request_log, response=result)
            return result
        finally:
            pop_llm_gateway_trace_id(run_id)

    async def _astream(
        self,
        messages: list[Any],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> AsyncIterator[Any]:
        run_id = str(getattr(run_manager, "run_id", "") or "")
        resolved_kwargs = dict(kwargs)
        gateway_trace_id = self._resolve_gateway_trace_id(run_id, resolved_kwargs)
        kwargs = self._inject_gateway_headers(resolved_kwargs, gateway_trace_id)
        request_log = self._start_request_log(
            run_id=run_id,
            gateway_trace_id=gateway_trace_id,
            messages=messages,
            call_kind="astream",
        )

        seen_input_tokens: int | None = None
        seen_output_tokens: int | None = None
        seen_total_tokens: int | None = None
        seen_cache_read_tokens: int | None = None
        stream_usage = _empty_token_usage()
        response_parts: list[str] = []
        try:
            async for chunk in super()._astream(
                messages,
                stop=stop,
                run_manager=run_manager,
                **kwargs,
            ):
                chunk_msg = getattr(chunk, "message", None)
                usage = getattr(chunk_msg, "usage_metadata", None) if chunk_msg else None
                if usage:
                    seen_input_tokens = _zero_repeated_usage_field(
                        usage,
                        "input_tokens",
                        seen_input_tokens,
                    )
                    seen_output_tokens = _zero_repeated_usage_field(
                        usage,
                        "output_tokens",
                        seen_output_tokens,
                    )
                    seen_total_tokens = _zero_repeated_usage_field(
                        usage,
                        "total_tokens",
                        seen_total_tokens,
                    )
                    seen_cache_read_tokens = _zero_repeated_cache_read(
                        usage,
                        seen_cache_read_tokens,
                    )
                    _merge_token_usage(stream_usage, _extract_token_usage_from_metadata(usage))
                text = _message_text(chunk_msg)
                if text:
                    response_parts.append(text)
                yield chunk
        except (asyncio.CancelledError, GeneratorExit) as exc:
            self._cancel_request_log(
                request_log,
                error=exc,
                response_preview="".join(response_parts),
            )
            logger.info(
                f"[LLM] astream 已取消 | run_id={run_id} | "
                f"gateway_trace_id={gateway_trace_id} | error={type(exc).__name__}"
            )
            raise
        except BaseException as exc:
            self._fail_request_log(
                request_log,
                error=exc,
                response_preview="".join(response_parts),
            )
            logger.opt(exception=True).error(
                f"[LLM] astream 失败 | run_id={run_id} | gateway_trace_id={gateway_trace_id}"
            )
            raise
        else:
            self._finish_request_log(
                request_log,
                response=None,
                response_preview="".join(response_parts),
                usage=stream_usage,
            )
        finally:
            pop_llm_gateway_trace_id(run_id)

    def _generate(
        self,
        messages: list[Any],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> Any:
        run_id = str(getattr(run_manager, "run_id", "") or "")
        resolved_kwargs = dict(kwargs)
        gateway_trace_id = self._resolve_gateway_trace_id(run_id, resolved_kwargs)
        kwargs = self._inject_gateway_headers(resolved_kwargs, gateway_trace_id)
        request_log = self._start_request_log(
            run_id=run_id,
            gateway_trace_id=gateway_trace_id,
            messages=messages,
            call_kind="generate",
        )
        try:
            result = super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)
        except (asyncio.CancelledError, GeneratorExit) as exc:
            self._cancel_request_log(request_log, error=exc)
            logger.info(
                f"[LLM] generate 已取消 | run_id={run_id} | "
                f"gateway_trace_id={gateway_trace_id} | error={type(exc).__name__}"
            )
            raise
        except BaseException as exc:
            self._fail_request_log(request_log, error=exc)
            logger.opt(exception=True).error(
                f"[LLM] generate 失败 | run_id={run_id} | gateway_trace_id={gateway_trace_id}"
            )
            raise
        else:
            self._finish_request_log(request_log, response=result)
            return result
        finally:
            pop_llm_gateway_trace_id(run_id)

    def _stream(
        self,
        messages: list[Any],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> Iterator[Any]:
        run_id = str(getattr(run_manager, "run_id", "") or "")
        resolved_kwargs = dict(kwargs)
        gateway_trace_id = self._resolve_gateway_trace_id(run_id, resolved_kwargs)
        kwargs = self._inject_gateway_headers(resolved_kwargs, gateway_trace_id)
        request_log = self._start_request_log(
            run_id=run_id,
            gateway_trace_id=gateway_trace_id,
            messages=messages,
            call_kind="stream",
        )
        seen_input_tokens: int | None = None
        seen_output_tokens: int | None = None
        seen_total_tokens: int | None = None
        seen_cache_read_tokens: int | None = None
        stream_usage = _empty_token_usage()
        response_parts: list[str] = []
        try:
            for chunk in super()._stream(
                messages,
                stop=stop,
                run_manager=run_manager,
                **kwargs,
            ):
                chunk_msg = getattr(chunk, "message", None)
                usage = getattr(chunk_msg, "usage_metadata", None) if chunk_msg else None
                if usage:
                    seen_input_tokens = _zero_repeated_usage_field(
                        usage,
                        "input_tokens",
                        seen_input_tokens,
                    )
                    seen_output_tokens = _zero_repeated_usage_field(
                        usage,
                        "output_tokens",
                        seen_output_tokens,
                    )
                    seen_total_tokens = _zero_repeated_usage_field(
                        usage,
                        "total_tokens",
                        seen_total_tokens,
                    )
                    seen_cache_read_tokens = _zero_repeated_cache_read(
                        usage,
                        seen_cache_read_tokens,
                    )
                    _merge_token_usage(stream_usage, _extract_token_usage_from_metadata(usage))
                text = _message_text(chunk_msg)
                if text:
                    response_parts.append(text)
                yield chunk
        except (asyncio.CancelledError, GeneratorExit) as exc:
            self._cancel_request_log(
                request_log,
                error=exc,
                response_preview="".join(response_parts),
            )
            logger.info(
                f"[LLM] stream 已取消 | run_id={run_id} | "
                f"gateway_trace_id={gateway_trace_id} | error={type(exc).__name__}"
            )
            raise
        except BaseException as exc:
            self._fail_request_log(
                request_log,
                error=exc,
                response_preview="".join(response_parts),
            )
            logger.opt(exception=True).error(
                f"[LLM] stream 失败 | run_id={run_id} | gateway_trace_id={gateway_trace_id}"
            )
            raise
        else:
            self._finish_request_log(
                request_log,
                response=None,
                response_preview="".join(response_parts),
                usage=stream_usage,
            )
        finally:
            pop_llm_gateway_trace_id(run_id)


def _duration_ms(started_at: float) -> int:
    return max(0, int((time.perf_counter() - started_at) * 1000))


def _model_name(model: Any) -> str:
    value = (
        getattr(model, "model_name", None)
        or getattr(model, "model", None)
        or getattr(model, "name", None)
    )
    return str(value or "unknown")


def _empty_token_usage() -> dict[str, int]:
    return {
        "input_tokens": 0,
        "cache_read_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
    }


def _merge_token_usage(target: dict[str, int], source: dict[str, int]) -> dict[str, int]:
    for key in ("input_tokens", "cache_read_tokens", "output_tokens", "total_tokens"):
        target[key] = int(target.get(key, 0) or 0) + int(source.get(key, 0) or 0)
    return target


def _extract_token_usage(value: Any) -> dict[str, int]:
    usage = _usage_metadata(value)
    if usage:
        return _extract_token_usage_from_metadata(usage)
    total = _empty_token_usage()
    found_generation_usage = False
    generations = getattr(value, "generations", None)
    if generations:
        for generation_group in generations:
            if isinstance(generation_group, list):
                generation_items = generation_group
            else:
                generation_items = [generation_group]
            for generation in generation_items:
                message = getattr(generation, "message", None)
                usage = _usage_metadata(message)
                if usage:
                    found_generation_usage = True
                    _merge_token_usage(total, _extract_token_usage_from_metadata(usage))
    llm_output = getattr(value, "llm_output", None)
    if isinstance(llm_output, dict) and not found_generation_usage:
        token_usage = llm_output.get("token_usage") or llm_output.get("usage")
        if token_usage:
            _merge_token_usage(total, _extract_token_usage_from_metadata(token_usage))
    return total


def _usage_metadata(value: Any) -> Any:
    if value is None:
        return None
    usage = getattr(value, "usage_metadata", None)
    if usage:
        return usage
    if isinstance(value, dict):
        return value.get("usage_metadata") or value.get("usage")
    return None


def _extract_token_usage_from_metadata(usage: Any) -> dict[str, int]:
    input_tokens = _usage_get(usage, "input_tokens") or _usage_get(usage, "prompt_tokens")
    output_tokens = _usage_get(usage, "output_tokens") or _usage_get(
        usage, "completion_tokens"
    )
    total_tokens = _usage_get(usage, "total_tokens") or input_tokens + output_tokens
    return {
        "input_tokens": input_tokens,
        "cache_read_tokens": _cache_read_tokens(usage),
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def _cache_read_tokens(usage: Any) -> int:
    details = (
        usage.get("input_token_details")
        if isinstance(usage, dict)
        else getattr(usage, "input_token_details", None)
    )
    if isinstance(details, dict):
        return int(
            details.get("cache_read", 0)
            or details.get("cached_tokens", 0)
            or details.get("cache_read_tokens", 0)
            or 0
        )
    if details is not None:
        return int(
            getattr(details, "cache_read", 0)
            or getattr(details, "cached_tokens", 0)
            or getattr(details, "cache_read_tokens", 0)
            or 0
        )
    prompt_details = (
        usage.get("prompt_tokens_details")
        if isinstance(usage, dict)
        else getattr(usage, "prompt_tokens_details", None)
    )
    if isinstance(prompt_details, dict):
        return int(prompt_details.get("cached_tokens", 0) or 0)
    if prompt_details is not None:
        return int(getattr(prompt_details, "cached_tokens", 0) or 0)
    return 0


def _response_preview(value: Any) -> str:
    generations = getattr(value, "generations", None)
    if generations:
        for generation_group in generations:
            if isinstance(generation_group, list):
                generation_items = generation_group
            else:
                generation_items = [generation_group]
            for generation in generation_items:
                text = _message_text(getattr(generation, "message", None))
                if text:
                    return text
    return _message_text(value) or _preview_value(value)


def _message_text(message: Any) -> str:
    if message is None:
        return ""
    content = getattr(message, "content", message)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


def _preview_value(value: Any, limit: int = 1000) -> str:
    if value is None:
        return ""
    text = str(value)
    return text if len(text) <= limit else f"{text[:limit]}..."


def _usage_get(usage: Any, key: str) -> int:
    if isinstance(usage, dict):
        return int(usage.get(key, 0) or 0)
    return int(getattr(usage, key, 0) or 0)


def _usage_set(usage: Any, key: str, value: int) -> None:
    if isinstance(usage, dict):
        usage[key] = value
    else:
        object.__setattr__(usage, key, value)


def _zero_repeated_usage_field(usage: Any, key: str, seen: int | None) -> int | None:
    raw = _usage_get(usage, key)
    if not raw:
        return seen
    if seen is None:
        return raw
    _usage_set(usage, key, 0)
    return seen


def _zero_repeated_cache_read(usage: Any, seen: int | None) -> int | None:
    details = (
        usage.get("input_token_details")
        if isinstance(usage, dict)
        else getattr(
            usage,
            "input_token_details",
            None,
        )
    )
    if not details:
        return seen
    raw_value = (
        details.get("cache_read", 0)
        if isinstance(details, dict)
        else getattr(details, "cache_read", 0)
    )
    raw = int(raw_value or 0)
    if not raw:
        return seen
    if seen is None:
        return raw
    if isinstance(details, dict):
        details["cache_read"] = 0
    else:
        object.__setattr__(details, "cache_read", 0)
    return seen


class AgentFactory:
    def __init__(self) -> None:
        self._llm_cache: dict[str, BaseChatModel] = {}
        self._llm_cache_locks: dict[str, threading.Lock] = {}
        self._llm_cache_locks_guard = threading.Lock()

    def _get_llm_cache_lock(self, cache_key: str) -> threading.Lock:
        with self._llm_cache_locks_guard:
            lock = self._llm_cache_locks.get(cache_key)
            if lock is None:
                lock = threading.Lock()
                self._llm_cache_locks[cache_key] = lock
            return lock

    def get_or_create_llm(
        self,
        settings: ModelSettings,
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        streaming: bool = True,
        http_transport: httpx.BaseTransport | httpx.AsyncBaseTransport | None = None,
        llm_request_logs: Any = None,
        provider_id: str | None = None,
        provider_name: str | None = None,
    ) -> BaseChatModel:
        if not settings.base_url:
            raise ValueError("模型服务地址未配置")
        request_model = (model or settings.model or "").strip()
        if not request_model:
            raise ValueError("模型未配置")
        url = _normalize_base_url(settings.base_url)
        api_key = settings.api_key or ""
        timeout = settings.timeout_seconds
        cache_key = (
            f"{api_key}:{url}:{request_model}:"
            f"{temperature}:{max_tokens}:{timeout}:{streaming}:"
            f"{id(http_transport) if http_transport else ''}:"
            f"{id(llm_request_logs) if llm_request_logs else ''}:"
            f"{provider_id or ''}:{provider_name or ''}"
        )
        cached = self._llm_cache.get(cache_key)
        if cached is not None:
            logger.debug(f"[LLM] 复用缓存实例 | model={request_model} | base_url={url}")
            return cached

        lock = self._get_llm_cache_lock(cache_key)
        with lock:
            cached = self._llm_cache.get(cache_key)
            if cached is not None:
                logger.debug(f"[LLM] 复用缓存实例 | model={request_model} | base_url={url}")
                return cached
            client_kwargs: dict[str, Any] = {}
            if http_transport is not None:
                client_kwargs["http_client"] = httpx.Client(
                    transport=http_transport,
                    timeout=timeout,
                )
                client_kwargs["http_async_client"] = httpx.AsyncClient(
                    transport=http_transport,
                    timeout=timeout,
                )
            llm = PatchedChatOpenAI(
                model=request_model,
                api_key=api_key,
                base_url=url,
                temperature=temperature,
                max_completion_tokens=max_tokens,
                timeout=timeout,
                streaming=streaming,
                stream_usage=True,
                use_responses_api=False,
                http_socket_options=(),
                llm_request_logs=llm_request_logs,
                provider_id=provider_id,
                provider_name=provider_name,
                **client_kwargs,
            )
            self._llm_cache[cache_key] = llm
            logger.info(
                f"[LLM] 创建模型实例 | model={request_model} | base_url={url} | "
                f"streaming={streaming} | timeout={timeout}"
            )
            return llm

    @staticmethod
    def create_agent(
        *,
        model: BaseChatModel,
        tools: list[Any],
        system_prompt: str | SystemMessage,
        checkpointer: Any,
        middleware: tuple[Any, ...] = (),
        state_schema: type[Any] | None = None,
        name: str = "desktop_agent",
    ) -> Any:
        return create_agent(
            model=model,
            tools=tools,
            system_prompt=system_prompt,
            middleware=middleware,
            state_schema=state_schema,
            checkpointer=checkpointer,
            name=name,
        )


def _normalize_base_url(base_url: str) -> str:
    url = base_url.strip().rstrip("/")
    suffix = "/chat/completions"
    if url.endswith(suffix):
        url = url[: -len(suffix)].rstrip("/")
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url


agent_factory = AgentFactory()
