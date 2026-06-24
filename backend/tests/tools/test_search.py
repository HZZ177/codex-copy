from __future__ import annotations

from backend.app.tools import ToolExecutionContext, ToolRegistry
from backend.app.tools.search import register_search_tools


def _context(tmp_path) -> ToolExecutionContext:
    return ToolExecutionContext(
        session_id="ses_search",
        user_id="local-user",
        workspace_root=tmp_path,
        turn_index=1,
    )


def _registry() -> ToolRegistry:
    return register_search_tools(ToolRegistry())


async def _run(name: str, args: dict, tmp_path):
    return await _registry().require(name).run(args, _context(tmp_path))


async def test_search_text_finds_chinese_content(tmp_path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("print('你好')\n# 关键逻辑\n", encoding="utf-8")

    result = await _run("search_text", {"query": "关键逻辑"}, tmp_path)

    assert result.ok is True
    assert result.result["results"][0]["path"] == "src/main.py"
    assert result.result["results"][0]["line"] == 2
    assert "关键逻辑" in result.result["results"][0]["snippet"]


async def test_search_text_supports_context_and_include_exclude(tmp_path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("one\nneedle\ntwo\n", encoding="utf-8")
    (tmp_path / "src" / "skip.txt").write_text("needle\n", encoding="utf-8")

    result = await _run(
        "search_text",
        {
            "query": "needle",
            "include": ["*.py"],
            "exclude": ["skip*"],
            "context_lines": 1,
        },
        tmp_path,
    )

    assert result.ok is True
    assert result.result["results"] == [
        {
            "path": "src/main.py",
            "line": 2,
            "snippet": "needle",
            "before_context": [{"line": 1, "text": "one"}],
            "after_context": [{"line": 3, "text": "two"}],
        }
    ]


async def test_search_text_returns_empty_results(tmp_path) -> None:
    (tmp_path / "README.md").write_text("hello", encoding="utf-8")

    result = await _run("search_text", {"query": "不存在"}, tmp_path)

    assert result.ok is True
    assert result.result["results"] == []


async def test_search_text_reports_invalid_regex(tmp_path) -> None:
    (tmp_path / "README.md").write_text("hello", encoding="utf-8")

    result = await _run("search_text", {"query": "[", "regex": True}, tmp_path)

    assert result.ok is False
    assert result.error["code"] == "invalid_search_pattern"


async def test_search_files_finds_by_name_and_path(tmp_path) -> None:
    (tmp_path / "src" / "pkg").mkdir(parents=True)
    (tmp_path / "src" / "pkg" / "agent.py").write_text("", encoding="utf-8")

    result = await _run("search_files", {"query": "pkg"}, tmp_path)

    paths = [item["path"] for item in result.result["results"]]
    assert "src/pkg" in paths
    assert "src/pkg/agent.py" in paths


async def test_search_files_does_not_search_file_contents(tmp_path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "agent.py").write_text("UNIQUE_CONTENT", encoding="utf-8")

    result = await _run("search_files", {"query": "UNIQUE_CONTENT"}, tmp_path)

    assert result.ok is True
    assert result.result["results"] == []
    assert result.result["search_scope"] == "path"


async def test_grep_files_finds_matching_file_paths(tmp_path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "docs").mkdir()
    (tmp_path / "src" / "agent.py").write_text("class LocalAgent:\n    pass\n", encoding="utf-8")
    (tmp_path / "docs" / "note.md").write_text("LocalAgent design\n", encoding="utf-8")

    result = await _run(
        "grep_files",
        {"query": "LocalAgent", "regex": False, "include": ["*.py"]},
        tmp_path,
    )

    assert result.ok is True
    assert result.result["paths"] == ["src/agent.py"]
    assert result.result["results"][0]["matches"] == 1
    assert result.result["results"][0]["first_line"] == 1


async def test_search_tools_reject_workspace_escape(tmp_path) -> None:
    outside = tmp_path.parent

    result = await _run("search_files", {"query": "x", "path": str(outside)}, tmp_path)

    assert result.ok is False
    assert result.error["code"] == "workspace_path_forbidden"
