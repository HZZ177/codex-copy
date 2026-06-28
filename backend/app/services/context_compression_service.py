from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

from backend.app.agent.checkpoint import SQLiteCheckpointSaver
from backend.app.agent.factory import AgentFactory, agent_factory
from backend.app.agent.runtime_settings import ContextCompressionRuntimeSettings
from backend.app.agent.side_task_model import SideTaskModelError, create_side_task_llm
from backend.app.core.ids import new_id
from backend.app.core.logger import logger
from backend.app.events import DomainEventType, EventDispatcher
from backend.app.events.actions import ReplayAction
from backend.app.services.checkpoint_service import CheckpointService
from backend.app.services.message_event_service import MessageEventService
from backend.app.storage import MessageEventRecord, SessionRecord, StorageRepositories

_SUMMARY_MESSAGE_ID = "keydex-context-compression-summary"


@dataclass(frozen=True)
class ContextCompressionOutcome:
    status: str
    reason: str | None = None
    source_session_id: str | None = None
    target_session_id: str | None = None
    source_checkpoint_id: str | None = None
    token_count: int = 0
    context_window_tokens: int = 0
    fraction: float = 0.0
    summary: str | None = None


class ContextCompressionService:
    def __init__(
        self,
        repositories: StorageRepositories,
        *,
        checkpointer: SQLiteCheckpointSaver | None = None,
        factory: AgentFactory = agent_factory,
        http_transport: httpx.BaseTransport | httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.repositories = repositories
        self.checkpointer = checkpointer or SQLiteCheckpointSaver(repositories.db)
        self.checkpoint_service = CheckpointService(repositories, checkpointer=self.checkpointer)
        self.message_event_service = MessageEventService(repositories.message_events)
        self.factory = factory
        self.http_transport = http_transport

    async def maybe_compress_after_turn(
        self,
        *,
        session_id: str,
        trace_id: str,
        turn_index: int,
        user_id: str,
        settings: ContextCompressionRuntimeSettings,
        latest_usage: dict[str, Any] | None = None,
        dispatcher: EventDispatcher | None = None,
    ) -> ContextCompressionOutcome:
        if not settings.enabled:
            return ContextCompressionOutcome(status="skipped", reason="disabled")

        source_session = self.repositories.sessions.get(session_id)
        if source_session is None:
            return ContextCompressionOutcome(status="skipped", reason="session_not_found")

        messages = self.message_event_service.get_display_messages(
            session_id, include_tool_details=False
        )
        token_count = _effective_token_count(messages, latest_usage)
        context_window_tokens = max(int(settings.context_window_tokens), 1)
        fraction = token_count / context_window_tokens
        if fraction < settings.trigger_fraction:
            return ContextCompressionOutcome(
                status="skipped",
                reason="below_threshold",
                source_session_id=session_id,
                token_count=token_count,
                context_window_tokens=context_window_tokens,
                fraction=fraction,
            )
        if not _compression_zone(messages, settings.retain_rounds):
            return ContextCompressionOutcome(
                status="skipped",
                reason="no_compressible_history",
                source_session_id=session_id,
                token_count=token_count,
                context_window_tokens=context_window_tokens,
                fraction=fraction,
            )

        try:
            source = self.checkpoint_service.resolve_trace(session_id=session_id, trace_id=trace_id)
            summary = await self.generate_summary(
                messages=messages, retain_rounds=settings.retain_rounds
            )
            target = self._create_compressed_session(
                source_session=source_session,
                source_active_session_id=source.active_session_id,
                checkpoint_id=source.checkpoint_id,
                checkpoint_ns=source.checkpoint_ns,
                summary=summary,
                retain_rounds=settings.retain_rounds,
                turn_index=turn_index,
            )
            await self._emit_compression_notice(
                dispatcher=dispatcher,
                session=source_session,
                target_session=target,
                trace_id=trace_id,
                turn_index=turn_index,
                user_id=user_id,
                token_count=token_count,
                context_window_tokens=context_window_tokens,
                fraction=fraction,
            )
            logger.info(
                "[ContextCompressionService] 上下文压缩完成 | "
                f"session_id={session_id} | target_session_id={target.id} | "
                f"checkpoint_id={source.checkpoint_id} | fraction={fraction:.4f}"
            )
            return ContextCompressionOutcome(
                status="compressed",
                source_session_id=session_id,
                target_session_id=target.id,
                source_checkpoint_id=source.checkpoint_id,
                token_count=token_count,
                context_window_tokens=context_window_tokens,
                fraction=fraction,
                summary=summary,
            )
        except Exception as exc:
            logger.opt(exception=True).warning(
                "[ContextCompressionService] 上下文压缩失败，主对话继续 | "
                f"session_id={session_id} | trace_id={trace_id} | error={exc}"
            )
            await self._emit_compression_failure(
                dispatcher=dispatcher,
                session=source_session,
                trace_id=trace_id,
                turn_index=turn_index,
                user_id=user_id,
                reason=str(exc),
            )
            return ContextCompressionOutcome(
                status="failed",
                reason=str(exc),
                source_session_id=session_id,
                token_count=token_count,
                context_window_tokens=context_window_tokens,
                fraction=fraction,
            )

    async def generate_summary(self, *, messages: list[dict[str, Any]], retain_rounds: int) -> str:
        compression_messages = _compression_zone(messages, retain_rounds)
        if not compression_messages:
            raise ValueError("empty_compression_zone")
        prompt_text = _render_messages_for_summary(compression_messages)
        try:
            side_task = create_side_task_llm(
                self.repositories,
                factory=self.factory,
                http_transport=self.http_transport,
                temperature=0.2,
                max_tokens=1200,
            )
        except SideTaskModelError:
            raise
        response = await side_task.llm.ainvoke(
            [
                SystemMessage(
                    content=(
                        "你是上下文压缩器。只输出可继续对话所需的事实、决策、约束、待办和关键文件路径。"
                        "不要输出寒暄、分析过程或 Markdown 标题。"
                    )
                ),
                HumanMessage(
                    content=(
                        "请为下面的历史消息生成上下文压缩摘要，供后续 agent 继续任务使用。\n\n"
                        f"{prompt_text}"
                    )
                ),
            ]
        )
        summary = _clean_summary_text(getattr(response, "content", response))
        if not summary:
            raise ValueError("empty_compression_summary")
        return summary

    def _create_compressed_session(
        self,
        *,
        source_session: SessionRecord,
        source_active_session_id: str,
        checkpoint_id: str,
        checkpoint_ns: str,
        summary: str,
        retain_rounds: int,
        turn_index: int,
    ) -> SessionRecord:
        current_source = self.repositories.sessions.get(source_session.id)
        current_active = (
            (current_source.active_session_id or current_source.id) if current_source else ""
        )
        if current_active != source_active_session_id:
            raise RuntimeError("active_session_changed")

        target_session_id = new_id()
        try:
            self.checkpointer.clone_checkpoint_to_thread(
                source_thread_id=source_active_session_id,
                target_thread_id=target_session_id,
                checkpoint_id=checkpoint_id,
                checkpoint_ns=checkpoint_ns,
            )
            target = self.repositories.sessions.create(
                session_id=target_session_id,
                user_id=source_session.user_id,
                scene_id=source_session.scene_id,
                title=_compressed_title(source_session.title),
                status="active",
                session_tag=source_session.session_tag,
                scene_version_seq=source_session.scene_version_seq,
                active_session_id=target_session_id,
                workspace_id=source_session.workspace_id,
                session_type=source_session.session_type,
                cwd=source_session.cwd,
                workspace_roots=source_session.workspace_roots,
                title_source="manual",
                parent_session_id=source_session.id,
                source_active_session_id=source_active_session_id,
                source_checkpoint_id=checkpoint_id,
                source_checkpoint_ns=checkpoint_ns,
            )
            self._write_compressed_checkpoint(
                target_session_id=target.id,
                checkpoint_id=checkpoint_id,
                checkpoint_ns=checkpoint_ns,
                summary=summary,
                retain_rounds=retain_rounds,
            )
            self._write_compressed_history(
                source_session=source_session,
                target_session=target,
                summary=summary,
                retain_rounds=retain_rounds,
                turn_index=turn_index,
            )
            self.repositories.sessions.update(
                source_session.id,
                active_session_id=target.id,
                child_session_id=target.id,
            )
            return self.repositories.sessions.get(target.id) or target
        except Exception:
            self.checkpointer.delete_thread(target_session_id)
            if self.repositories.sessions.get(target_session_id) is not None:
                self.repositories.sessions.soft_delete(target_session_id)
            raise

    def _write_compressed_checkpoint(
        self,
        *,
        target_session_id: str,
        checkpoint_id: str,
        checkpoint_ns: str,
        summary: str,
        retain_rounds: int,
    ) -> None:
        checkpoint = self.checkpointer.get_tuple(
            {
                "configurable": {
                    "thread_id": target_session_id,
                    "checkpoint_ns": checkpoint_ns,
                    "checkpoint_id": checkpoint_id,
                }
            }
        )
        if checkpoint is None:
            raise RuntimeError("cloned_checkpoint_missing")
        channel_values = checkpoint.checkpoint.get("channel_values") or {}
        state_messages = list(channel_values.get("messages") or [])
        compressed_messages: list[BaseMessage] = [
            SystemMessage(content=_summary_system_content(summary), id=_SUMMARY_MESSAGE_ID),
            *_retain_recent_state_messages(state_messages, retain_rounds),
        ]
        self.checkpointer.replace_checkpoint_messages(
            thread_id=target_session_id,
            checkpoint_id=checkpoint_id,
            checkpoint_ns=checkpoint_ns,
            messages=compressed_messages,
        )

    def _write_compressed_history(
        self,
        *,
        source_session: SessionRecord,
        target_session: SessionRecord,
        summary: str,
        retain_rounds: int,
        turn_index: int,
    ) -> None:
        retain_start = (
            max(1, turn_index - retain_rounds + 1) if retain_rounds > 0 else turn_index + 1
        )
        self.repositories.message_events.append(
            event_id=new_id(),
            session_id=target_session.id,
            trace_record_id=None,
            turn_index=max(1, retain_start - 1),
            action=ReplayAction.SYSTEM_MESSAGE.value,
            data={
                "session_id": target_session.id,
                "content": f"上下文已压缩。摘要：\n{summary}",
                "compression": {
                    "kind": "context_summary",
                    "source_session_id": source_session.id,
                    "source_active_session_id": source_session.active_session_id
                    or source_session.id,
                },
            },
        )
        if retain_rounds <= 0:
            return
        for event in self.repositories.message_events.list_by_session(
            source_session.id, limit=5000
        ):
            if event.turn_index < retain_start:
                continue
            self.repositories.message_events.append(
                event_id=new_id(),
                session_id=target_session.id,
                trace_record_id=event.trace_record_id,
                turn_index=event.turn_index,
                action=event.action,
                data=_copy_event_data(
                    event, source_session=source_session, target_session=target_session
                ),
            )

    async def _emit_compression_notice(
        self,
        *,
        dispatcher: EventDispatcher | None,
        session: SessionRecord,
        target_session: SessionRecord,
        trace_id: str,
        turn_index: int,
        user_id: str,
        token_count: int,
        context_window_tokens: int,
        fraction: float,
    ) -> None:
        if dispatcher is None:
            self.repositories.message_events.append(
                event_id=new_id(),
                session_id=session.id,
                trace_record_id=trace_id,
                turn_index=turn_index,
                action=ReplayAction.SYSTEM_MESSAGE.value,
                data=_compression_notice_payload(
                    session=session,
                    target_session=target_session,
                    token_count=token_count,
                    context_window_tokens=context_window_tokens,
                    fraction=fraction,
                ),
            )
            return
        await dispatcher.emit_event(
            event_type=DomainEventType.MESSAGE_SYSTEM_CREATED.value,
            source="context_compression",
            payload=_compression_notice_payload(
                session=session,
                target_session=target_session,
                token_count=token_count,
                context_window_tokens=context_window_tokens,
                fraction=fraction,
            ),
            trace_id=trace_id,
            user_id=user_id or session.user_id,
            original_session_id=session.id,
            active_session_id=target_session.id,
            turn_index=turn_index,
        )

    async def _emit_compression_failure(
        self,
        *,
        dispatcher: EventDispatcher | None,
        session: SessionRecord,
        trace_id: str,
        turn_index: int,
        user_id: str,
        reason: str,
    ) -> None:
        payload = {
            "session_id": session.id,
            "content": "上下文压缩失败，已继续使用当前上下文。",
            "compression": {"kind": "context_compression_failed", "reason": reason},
        }
        if dispatcher is None:
            self.repositories.message_events.append(
                event_id=new_id(),
                session_id=session.id,
                trace_record_id=trace_id,
                turn_index=turn_index,
                action=ReplayAction.SYSTEM_MESSAGE.value,
                data=payload,
            )
            return
        await dispatcher.emit_event(
            event_type=DomainEventType.MESSAGE_SYSTEM_CREATED.value,
            source="context_compression",
            payload=payload,
            trace_id=trace_id,
            user_id=user_id or session.user_id,
            original_session_id=session.id,
            active_session_id=session.active_session_id or session.id,
            turn_index=turn_index,
        )


def _compression_notice_payload(
    *,
    session: SessionRecord,
    target_session: SessionRecord,
    token_count: int,
    context_window_tokens: int,
    fraction: float,
) -> dict[str, Any]:
    return {
        "session_id": session.id,
        "content": "上下文已压缩，后续对话将从压缩分支继续。",
        "compression": {
            "kind": "context_compressed",
            "target_session_id": target_session.id,
            "token_count": token_count,
            "context_window_tokens": context_window_tokens,
            "fraction": fraction,
        },
    }


def _effective_token_count(
    messages: list[dict[str, Any]], latest_usage: dict[str, Any] | None
) -> int:
    usage = latest_usage or {}
    total = _safe_int(usage.get("total_tokens"))
    if total <= 0:
        total = _safe_int(usage.get("input_tokens")) + _safe_int(usage.get("output_tokens"))
    if total > 0:
        return total
    return max(1, sum(len(str(message.get("content") or "")) for message in messages) // 2)


def _safe_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _compression_zone(messages: list[dict[str, Any]], retain_rounds: int) -> list[dict[str, Any]]:
    if retain_rounds <= 0:
        return list(messages)
    retain_start_index = _retain_start_message_index(messages, retain_rounds)
    return messages[:retain_start_index]


def _retain_start_message_index(messages: list[dict[str, Any]], retain_rounds: int) -> int:
    user_seen = 0
    for index in range(len(messages) - 1, -1, -1):
        if messages[index].get("role") == "user":
            user_seen += 1
            if user_seen >= retain_rounds:
                return index
    return 0


def _render_messages_for_summary(messages: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for message in messages:
        role = str(message.get("role") or "unknown")
        content = str(message.get("content") or "").strip()
        if not content:
            continue
        lines.append(f"[{role}]\n{content}")
    return "\n\n".join(lines).strip()


def _clean_summary_text(content: Any) -> str:
    if isinstance(content, list):
        text = "".join(str(item.get("text") or "") for item in content if isinstance(item, dict))
    else:
        text = str(content or "")
    for token in (
        "<context_compression:l1>",
        "</context_compression:l1>",
        "<context_compression:l2>",
        "</context_compression:l2>",
    ):
        text = text.replace(token, "")
    return text.strip()


def _summary_system_content(summary: str) -> str:
    return f"以下是此前对话的压缩摘要。继续任务时必须优先遵守这些事实、约束和待办。\n\n{summary}"


def _retain_recent_state_messages(messages: list[Any], retain_rounds: int) -> list[BaseMessage]:
    base_messages = [message for message in messages if isinstance(message, BaseMessage)]
    if retain_rounds <= 0:
        return []
    human_seen = 0
    start_index = 0
    for index in range(len(base_messages) - 1, -1, -1):
        if isinstance(base_messages[index], HumanMessage):
            human_seen += 1
            if human_seen >= retain_rounds:
                start_index = index
                break
    retained = base_messages[start_index:] if human_seen >= retain_rounds else base_messages
    return [
        message
        for message in retained
        if not (
            isinstance(message, SystemMessage)
            and getattr(message, "id", None) == _SUMMARY_MESSAGE_ID
        )
    ]


def _copy_event_data(
    event: MessageEventRecord,
    *,
    source_session: SessionRecord,
    target_session: SessionRecord,
) -> dict[str, Any]:
    data = dict(event.data or {})
    if data.get("session_id") == source_session.id:
        data["session_id"] = target_session.id
    if data.get("original_session_id") == source_session.id:
        data["original_session_id"] = target_session.id
    if data.get("active_session_id") == (source_session.active_session_id or source_session.id):
        data["active_session_id"] = target_session.id
    return data


def _compressed_title(title: str | None) -> str:
    base = (title or "新会话").strip() or "新会话"
    return f"{base} 压缩"
