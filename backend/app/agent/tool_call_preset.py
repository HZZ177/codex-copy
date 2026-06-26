from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

_TOOL_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

ToolCallPresetType = Literal["force", "guide"]
ToolCallPresetProducer = Literal["skill_activation"]


@dataclass(frozen=True)
class ToolCallPresetItem:
    name: str
    args: dict[str, Any]

    def __post_init__(self) -> None:
        name = self.name.strip()
        if not _TOOL_NAME_PATTERN.fullmatch(name):
            raise ValueError(f"invalid tool preset name: {self.name!r}")
        if not isinstance(self.args, dict):
            raise ValueError("tool preset args must be a dict")
        object.__setattr__(self, "name", name)
        object.__setattr__(self, "args", dict(self.args))

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "args": dict(self.args)}


@dataclass(frozen=True)
class ToolCallPreset:
    type: ToolCallPresetType
    calls: list[ToolCallPresetItem]
    producer: ToolCallPresetProducer = "skill_activation"
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.type not in {"force", "guide"}:
            raise ValueError(f"unsupported tool call preset type: {self.type}")
        if self.producer != "skill_activation":
            raise ValueError("tool call preset producer is not allowed in this phase")
        if not self.calls:
            raise ValueError("tool call preset calls must not be empty")
        calls = [
            call if isinstance(call, ToolCallPresetItem) else ToolCallPresetItem(**call)
            for call in self.calls
        ]
        if self.type == "force":
            empty_args = [call.name for call in calls if not call.args]
            if empty_args:
                raise ValueError("force tool call preset requires non-empty args")
        object.__setattr__(self, "calls", calls)
        object.__setattr__(self, "metadata", dict(self.metadata))

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "producer": self.producer,
            "calls": [call.to_dict() for call in self.calls],
            "metadata": dict(self.metadata),
        }
