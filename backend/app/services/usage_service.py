from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.storage import (
    LLMRequestLogRecord,
    StorageRepositories,
    TraceRecord,
)


class UsageRequestNotFoundError(Exception):
    """Raised when a usage request log cannot be found."""


class UsageValidationError(ValueError):
    """Raised when usage query parameters are invalid."""


@dataclass(frozen=True)
class UsageRequestQuery:
    start_time: str | None = None
    end_time: str | None = None
    model: str | None = None
    status: str | None = None
    page: int = 1
    page_size: int = 20


class UsageService:
    def __init__(self, repositories: StorageRepositories) -> None:
        self.repositories = repositories

    def get_summary(
        self,
        *,
        start_time: str | None = None,
        end_time: str | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        return self.repositories.llm_request_logs.summary(
            start_time=start_time,
            end_time=end_time,
            model=model,
        )

    def get_trend(
        self,
        *,
        start_time: str | None = None,
        end_time: str | None = None,
        model: str | None = None,
        bucket: str = "day",
        timezone_offset_minutes: int = 0,
        start_after: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        return self.get_trend_page(
            start_time=start_time,
            end_time=end_time,
            model=model,
            bucket=bucket,
            timezone_offset_minutes=timezone_offset_minutes,
            start_after=start_after,
            limit=limit,
        )["points"]

    def get_trend_page(
        self,
        *,
        start_time: str | None = None,
        end_time: str | None = None,
        model: str | None = None,
        bucket: str = "day",
        timezone_offset_minutes: int = 0,
        start_after: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        try:
            return self.repositories.llm_request_logs.trend_page(
                start_time=start_time,
                end_time=end_time,
                model=model,
                bucket=bucket,
                timezone_offset_minutes=timezone_offset_minutes,
                start_after=start_after,
                limit=limit,
            )
        except ValueError as exc:
            raise UsageValidationError(str(exc)) from exc

    def list_requests(self, query: UsageRequestQuery) -> dict[str, Any]:
        if query.page < 1:
            raise UsageValidationError("页码必须大于等于 1")
        if query.page_size < 1 or query.page_size > 200:
            raise UsageValidationError("每页数量必须在 1 到 200 之间")
        records, total = self.repositories.llm_request_logs.list(
            start_time=query.start_time,
            end_time=query.end_time,
            model=query.model,
            status=query.status,
            page=query.page,
            page_size=query.page_size,
        )
        return {
            "list": [_request_log_to_dict(record) for record in records],
            "total": total,
            "page": query.page,
            "page_size": query.page_size,
        }

    def get_request_detail(self, request_id: str) -> dict[str, Any]:
        record = self.repositories.llm_request_logs.get(request_id)
        if record is None:
            raise UsageRequestNotFoundError(f"请求日志不存在: {request_id}")
        trace = self.repositories.trace_records.get(record.trace_record_id)
        return {
            "request": _request_log_to_dict(record, include_previews=True),
            "trace": _trace_to_dict(trace) if trace else None,
            "events": [],
        }


def _request_log_to_dict(
    record: LLMRequestLogRecord,
    *,
    include_previews: bool = True,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": record.id,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "trace_id": record.trace_id,
        "trace_record_id": record.trace_record_id,
        "session_id": record.session_id,
        "active_session_id": record.active_session_id,
        "gateway_thread_id": record.gateway_thread_id,
        "gateway_trace_id": record.gateway_trace_id,
        "turn_index": record.turn_index,
        "provider_id": record.provider_id,
        "provider_name": record.provider_name,
        "model": record.model,
        "status": record.status,
        "start_time": record.start_time,
        "end_time": record.end_time,
        "duration_ms": record.duration_ms,
        "time_to_first_token": record.time_to_first_token,
        "output_tokens_per_second": _output_tokens_per_second(record),
        "input_tokens": record.input_tokens,
        "cache_read_tokens": record.cache_read_tokens,
        "output_tokens": record.output_tokens,
        "total_tokens": record.total_tokens,
        "error_message": record.error_message,
    }
    if include_previews:
        data["request_preview"] = record.request_preview
        data["response_preview"] = record.response_preview
        data["metadata"] = record.metadata or {}
    return data


def _output_tokens_per_second(record: LLMRequestLogRecord) -> float | None:
    duration_ms = record.duration_ms
    if duration_ms is None or duration_ms < 0:
        return None
    output_tokens = max(0, int(record.output_tokens or 0))
    effective_duration_ms = duration_ms
    if _is_stream_call(record):
        if record.time_to_first_token is None:
            return None
        effective_duration_ms = duration_ms - record.time_to_first_token
    effective_duration_ms = max(1, int(effective_duration_ms or 0))
    return round((output_tokens * 1000) / effective_duration_ms, 1)


def _is_stream_call(record: LLMRequestLogRecord) -> bool:
    call_kind = (record.metadata or {}).get("call_kind")
    return call_kind in {"astream", "stream"}


def _trace_to_dict(record: TraceRecord) -> dict[str, Any]:
    return {
        "trace_id": record.trace_id,
        "session_id": record.session_id,
        "active_session_id": record.active_session_id,
        "scene_id": record.scene_id,
        "scene_name": record.scene_name,
        "user_id": record.user_id,
        "turn_index": record.turn_index,
        "status": record.status,
        "start_time": record.start_time,
        "end_time": record.end_time,
        "duration_ms": record.duration_ms,
        "total_input_tokens": record.total_input_tokens,
        "total_cache_read_tokens": record.total_cache_read_tokens,
        "total_output_tokens": record.total_output_tokens,
        "total_tokens": record.total_tokens,
        "user_message_preview": record.user_message_preview,
    }
