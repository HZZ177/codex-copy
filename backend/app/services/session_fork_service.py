from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.agent.checkpoint import SQLiteCheckpointSaver
from backend.app.core.ids import new_id
from backend.app.core.logger import logger
from backend.app.services.checkpoint_service import (
    CheckpointService,
    CheckpointServiceError,
    CheckpointSource,
)
from backend.app.storage import MessageEventRecord, SessionRecord, StorageRepositories


class SessionForkServiceError(ValueError):
    def __init__(
        self,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


@dataclass(frozen=True)
class SessionForkResult:
    session: SessionRecord
    source: CheckpointSource


class SessionForkService:
    def __init__(
        self,
        repositories: StorageRepositories,
        *,
        checkpointer: SQLiteCheckpointSaver | None = None,
        checkpoint_service: CheckpointService | None = None,
    ) -> None:
        self.repositories = repositories
        self.checkpointer = checkpointer or SQLiteCheckpointSaver(repositories.db)
        self.checkpoint_service = checkpoint_service or CheckpointService(
            repositories,
            checkpointer=self.checkpointer,
        )

    def fork_session(
        self,
        *,
        session_id: str,
        user_id: str,
        title: str | None = None,
        checkpoint_id: str | None = None,
        checkpoint_ns: str | None = None,
        trace_id: str | None = None,
        message_event_id: str | None = None,
        turn_index: int | None = None,
        make_active: bool = False,
    ) -> SessionForkResult:
        source_session = self._require_session(session_id)
        try:
            source = self.checkpoint_service.resolve_source(
                session_id=session_id,
                checkpoint_id=checkpoint_id,
                checkpoint_ns=checkpoint_ns,
                trace_id=trace_id,
                message_event_id=message_event_id,
                turn_index=turn_index,
            )
        except CheckpointServiceError as exc:
            raise SessionForkServiceError(exc.code, exc.message, exc.details) from exc

        target_session_id = new_id()
        try:
            self.checkpointer.clone_checkpoint_to_thread(
                source_thread_id=source.active_session_id,
                target_thread_id=target_session_id,
                checkpoint_id=source.checkpoint_id,
                checkpoint_ns=source.checkpoint_ns,
            )
            target = self.repositories.sessions.create(
                session_id=target_session_id,
                user_id=user_id or source_session.user_id,
                scene_id=source_session.scene_id,
                title=self._fork_title(source_session, title),
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
                source_trace_id=source.trace_id,
                source_active_session_id=source.active_session_id,
                source_checkpoint_id=source.checkpoint_id,
                source_checkpoint_ns=source.checkpoint_ns,
            )
            self._copy_visible_history(
                source_session=source_session,
                target_session=target,
                cutoff_turn_index=source.turn_index,
            )
            self.repositories.sessions.update(source_session.id, child_session_id=target.id)
            if make_active:
                self.repositories.sessions.update(source_session.id, active_session_id=target.id)
            target = self._require_session(target.id)
            logger.info(
                "[SessionForkService] 创建 session 分支 | "
                f"source_session_id={source_session.id} | target_session_id={target.id} | "
                f"checkpoint_id={source.checkpoint_id} | make_active={make_active}"
            )
            return SessionForkResult(session=target, source=source)
        except Exception as exc:
            self.checkpointer.delete_thread(target_session_id)
            if self.repositories.sessions.get(target_session_id) is not None:
                self.repositories.sessions.soft_delete(target_session_id)
            if isinstance(exc, SessionForkServiceError):
                raise
            raise SessionForkServiceError(
                "session_fork_failed",
                "创建 session 分支失败",
                {"session_id": session_id, "target_session_id": target_session_id},
            ) from exc

    def reverse_session(
        self,
        *,
        session_id: str,
        user_id: str,
        title: str | None = None,
        checkpoint_id: str | None = None,
        checkpoint_ns: str | None = None,
        trace_id: str | None = None,
        message_event_id: str | None = None,
        turn_index: int | None = None,
    ) -> SessionForkResult:
        return self.fork_session(
            session_id=session_id,
            user_id=user_id,
            title=title,
            checkpoint_id=checkpoint_id,
            checkpoint_ns=checkpoint_ns,
            trace_id=trace_id,
            message_event_id=message_event_id,
            turn_index=turn_index,
            make_active=True,
        )

    def _copy_visible_history(
        self,
        *,
        source_session: SessionRecord,
        target_session: SessionRecord,
        cutoff_turn_index: int | None,
    ) -> None:
        events = self.repositories.message_events.list_by_session(source_session.id, limit=5000)
        for event in events:
            if cutoff_turn_index is not None and event.turn_index > cutoff_turn_index:
                continue
            self.repositories.message_events.append(
                event_id=new_id(),
                session_id=target_session.id,
                trace_record_id=event.trace_record_id,
                turn_index=event.turn_index,
                action=event.action,
                data=self._copy_event_data(
                    event,
                    source_session=source_session,
                    target_session=target_session,
                ),
            )

    @staticmethod
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

    @staticmethod
    def _fork_title(source_session: SessionRecord, title: str | None) -> str:
        cleaned = (title or "").strip()
        if cleaned:
            return cleaned
        base = (source_session.title or "新会话").strip() or "新会话"
        return f"{base} 分支"

    def _require_session(self, session_id: str) -> SessionRecord:
        session = self.repositories.sessions.get(session_id)
        if session is None:
            raise SessionForkServiceError(
                "session_not_found",
                "session 不存在",
                {"session_id": session_id},
            )
        return session
