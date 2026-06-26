from pathlib import Path
from typing import Any

import pytest

from backend.app.keydex import KeydexWorkspaceRuntimeCache
from backend.app.keydex.watcher import KeydexWorkspaceWatcher, is_keydex_watch_target


class RecordingRuntimeCache(KeydexWorkspaceRuntimeCache):
    def __init__(self) -> None:
        super().__init__()
        self.invalidated: list[Path] = []

    def invalidate(self, workspace_root: str | Path) -> None:
        self.invalidated.append(Path(workspace_root).expanduser().resolve())
        super().invalidate(workspace_root)


@pytest.mark.asyncio
async def test_watcher_invalidates_and_notifies_registered_workspace_session(
    tmp_path: Path,
) -> None:
    cache = RecordingRuntimeCache()
    events: list[tuple[str, dict[str, Any]]] = []

    async def notifier(session_id: str, data: dict[str, Any]) -> bool:
        events.append((session_id, data))
        return True

    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    watcher = KeydexWorkspaceWatcher(
        runtime_cache=cache,
        notifier=notifier,
        start_tasks=False,
        debounce_seconds=0,
    )
    await watcher.register_session("session-1", workspace_root)

    changed = await watcher.handle_path_change(workspace_root, ".keydex/keydex.json")

    assert changed is True
    assert cache.invalidated == [workspace_root.resolve()]
    assert events[0][0] == "session-1"
    assert events[0][1]["workspace_root"] == workspace_root.resolve().as_posix()
    assert events[0][1]["changed_path"] == ".keydex/keydex.json"
    assert len(events[0][1]["fingerprint"]) == 64


@pytest.mark.asyncio
async def test_watcher_handles_create_modify_delete_targets(tmp_path: Path) -> None:
    cache = RecordingRuntimeCache()
    events: list[tuple[str, dict[str, Any]]] = []

    async def notifier(session_id: str, data: dict[str, Any]) -> bool:
        events.append((session_id, data))
        return True

    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    watcher = KeydexWorkspaceWatcher(
        runtime_cache=cache,
        notifier=notifier,
        start_tasks=False,
        debounce_seconds=0,
    )
    await watcher.register_session("session-1", workspace_root)

    await watcher.handle_path_change(workspace_root, ".keydex/keydex.json")
    await watcher.handle_path_change(workspace_root, ".keydex/skills/dev-plan/SKILL.md")
    await watcher.handle_path_change(workspace_root, workspace_root / ".keydex/skills/old/SKILL.md")

    assert len(cache.invalidated) == 3
    assert [event[1]["changed_path"] for event in events] == [
        ".keydex/keydex.json",
        ".keydex/skills/dev-plan/SKILL.md",
        ".keydex/skills/old/SKILL.md",
    ]


@pytest.mark.asyncio
async def test_watcher_debounces_duplicate_events(tmp_path: Path) -> None:
    cache = RecordingRuntimeCache()
    events: list[tuple[str, dict[str, Any]]] = []

    async def notifier(session_id: str, data: dict[str, Any]) -> bool:
        events.append((session_id, data))
        return True

    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    watcher = KeydexWorkspaceWatcher(
        runtime_cache=cache,
        notifier=notifier,
        start_tasks=False,
        debounce_seconds=60,
    )
    await watcher.register_session("session-1", workspace_root)

    first = await watcher.handle_path_change(workspace_root, ".keydex/keydex.json")
    second = await watcher.handle_path_change(workspace_root, ".keydex/keydex.json")

    assert first is True
    assert second is False
    assert len(cache.invalidated) == 1
    assert len(events) == 1


@pytest.mark.asyncio
async def test_watcher_unregisters_session_notifications(tmp_path: Path) -> None:
    cache = RecordingRuntimeCache()
    events: list[tuple[str, dict[str, Any]]] = []

    async def notifier(session_id: str, data: dict[str, Any]) -> bool:
        events.append((session_id, data))
        return True

    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()
    watcher = KeydexWorkspaceWatcher(
        runtime_cache=cache,
        notifier=notifier,
        start_tasks=False,
        debounce_seconds=0,
    )
    await watcher.register_session("session-1", workspace_root)
    await watcher.unregister_session("session-1")

    changed = await watcher.handle_path_change(workspace_root, ".keydex/keydex.json")

    assert changed is True
    assert cache.invalidated == [workspace_root.resolve()]
    assert events == []


def test_is_keydex_watch_target_matches_only_manifest_and_skill_entry(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "repo"
    workspace_root.mkdir()

    assert is_keydex_watch_target(workspace_root, ".keydex/keydex.json") is True
    assert is_keydex_watch_target(workspace_root, ".keydex/skills/dev-plan/SKILL.md") is True
    assert (
        is_keydex_watch_target(workspace_root, ".keydex/skills/dev-plan/references/guide.md")
        is False
    )
    assert is_keydex_watch_target(workspace_root, ".agents/skills/dev-plan/SKILL.md") is False
