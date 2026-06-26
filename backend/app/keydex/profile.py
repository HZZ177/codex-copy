from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.app.keydex.models import KeydexDiagnostic, KeydexLayer, KeydexWorkspaceProfile

DEFAULT_SCHEMA_VERSION = 1
MANIFEST_RELATIVE_PATH = ".keydex/keydex.json"


class KeydexManifestError(ValueError):
    pass


def default_keydex_manifest() -> dict[str, Any]:
    return {
        "schema_version": DEFAULT_SCHEMA_VERSION,
        "skills": {"enabled": True},
    }


def load_keydex_workspace_profile(workspace_root: str | Path) -> KeydexWorkspaceProfile:
    resolved_root = Path(workspace_root).expanduser().resolve()
    keydex_root = resolved_root / ".keydex"
    manifest_path = keydex_root / "keydex.json"
    diagnostics: list[KeydexDiagnostic] = []
    manifest = default_keydex_manifest()

    if manifest_path.is_file():
        try:
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest = merge_keydex_manifest(raw_manifest, diagnostics)
        except (OSError, json.JSONDecodeError, KeydexManifestError) as exc:
            diagnostics.append(
                KeydexDiagnostic(
                    code="keydex_manifest_invalid",
                    path=MANIFEST_RELATIVE_PATH,
                    severity="error",
                    reason=str(exc),
                )
            )
            manifest = default_keydex_manifest()
            manifest["skills"]["enabled"] = False
    elif manifest_path.exists():
        diagnostics.append(
            KeydexDiagnostic(
                code="keydex_manifest_invalid",
                path=MANIFEST_RELATIVE_PATH,
                severity="error",
                reason="manifest path is not a file",
            )
        )
        manifest["skills"]["enabled"] = False

    layer_enabled = keydex_root.is_dir()
    skills_enabled = layer_enabled and bool(manifest.get("skills", {}).get("enabled", True))
    layer = KeydexLayer(
        scope="workspace",
        root=keydex_root,
        enabled=layer_enabled,
        manifest=manifest,
        diagnostics=diagnostics,
    )

    return KeydexWorkspaceProfile(
        workspace_root=resolved_root,
        keydex_root=keydex_root,
        active_layers=[layer],
        skills_root=keydex_root / "skills" if skills_enabled else None,
        skills_enabled=skills_enabled,
        diagnostics=diagnostics,
    )


def merge_keydex_manifest(
    raw_manifest: Any,
    diagnostics: list[KeydexDiagnostic] | None = None,
) -> dict[str, Any]:
    if not isinstance(raw_manifest, dict):
        raise KeydexManifestError("manifest root must be a JSON object")

    diagnostics = diagnostics if diagnostics is not None else []
    manifest = default_keydex_manifest()

    _warn_unknown_fields(
        raw_manifest,
        known_fields={"schema_version", "skills"},
        diagnostics=diagnostics,
        field_path="",
    )

    if "schema_version" in raw_manifest:
        schema_version = raw_manifest["schema_version"]
        if not isinstance(schema_version, int) or isinstance(schema_version, bool):
            raise KeydexManifestError("schema_version must be an integer")
        manifest["schema_version"] = schema_version

    if "skills" in raw_manifest:
        skills = raw_manifest["skills"]
        if not isinstance(skills, dict):
            raise KeydexManifestError("skills must be a JSON object")
        _warn_unknown_fields(
            skills,
            known_fields={"enabled"},
            diagnostics=diagnostics,
            field_path="skills",
        )
        if "enabled" in skills:
            enabled = skills["enabled"]
            if not isinstance(enabled, bool):
                raise KeydexManifestError("skills.enabled must be a boolean")
            manifest["skills"]["enabled"] = enabled

    return manifest


def _warn_unknown_fields(
    data: dict[str, Any],
    *,
    known_fields: set[str],
    diagnostics: list[KeydexDiagnostic],
    field_path: str,
) -> None:
    for field_name in sorted(set(data) - known_fields):
        qualified_name = f"{field_path}.{field_name}" if field_path else field_name
        diagnostics.append(
            KeydexDiagnostic(
                code="keydex_manifest_unknown_field",
                path=MANIFEST_RELATIVE_PATH,
                severity="warning",
                reason=f"unknown manifest field: {qualified_name}",
                details={"field": qualified_name},
            )
        )
