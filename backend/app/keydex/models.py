from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

KeydexScope = Literal["workspace", "system"]


@dataclass(frozen=True)
class KeydexDiagnostic:
    code: str
    reason: str
    path: str | None = None
    severity: Literal["warning", "error"] = "warning"
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "reason": self.reason,
            "path": self.path,
            "severity": self.severity,
            "details": self.details,
        }


@dataclass(frozen=True)
class KeydexLayer:
    scope: KeydexScope
    root: Path
    enabled: bool
    manifest: dict[str, Any] = field(default_factory=dict)
    diagnostics: list[KeydexDiagnostic] = field(default_factory=list)

    def __post_init__(self) -> None:
        object.__setattr__(self, "root", Path(self.root).expanduser().resolve())


@dataclass(frozen=True)
class KeydexWorkspaceProfile:
    workspace_root: Path
    keydex_root: Path
    active_layers: list[KeydexLayer] = field(default_factory=list)
    skills_root: Path | None = None
    skills_enabled: bool = True
    diagnostics: list[KeydexDiagnostic] = field(default_factory=list)

    def __post_init__(self) -> None:
        workspace_root = Path(self.workspace_root).expanduser().resolve()
        keydex_root = Path(self.keydex_root).expanduser().resolve()
        skills_root = (
            Path(self.skills_root).expanduser().resolve() if self.skills_root is not None else None
        )
        object.__setattr__(self, "workspace_root", workspace_root)
        object.__setattr__(self, "keydex_root", keydex_root)
        object.__setattr__(self, "skills_root", skills_root)
