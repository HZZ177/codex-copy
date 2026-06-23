from __future__ import annotations

from backend.app.tools import ToolExecutionContext, ToolRegistry
from backend.app.tools.patch import register_patch_tools


def _context(tmp_path) -> ToolExecutionContext:
    return ToolExecutionContext(
        session_id="ses_patch",
        user_id="local-user",
        workspace_root=tmp_path,
        turn_index=1,
    )


def _registry() -> ToolRegistry:
    return register_patch_tools(ToolRegistry())


async def _run(patch: str, tmp_path):
    return await _registry().require("apply_patch").run({"patch": patch}, _context(tmp_path))


def test_apply_patch_tool_contract_documents_required_headers() -> None:
    tool = _registry().require("apply_patch")

    assert "*** Update File: <path>" in tool.description
    assert "*** Add File: <path>" in tool.description
    assert "*** Delete File: <path>" in tool.description
    assert "不要写 `*** docs/file.md`" in tool.description
    assert "*** Update File: <path>" in tool.parameters["properties"]["patch"]["description"]


async def test_apply_patch_adds_file_inside_workspace(tmp_path) -> None:
    result = await _run(
        """*** Begin Patch
*** Add File: docs/note.txt
+第一行
+第二行
*** End Patch""",
        tmp_path,
    )

    assert result.ok is True
    assert result.result["changes"] == [
        {
            "operation": "update",
            "path": "docs/note.txt",
            "added_lines": 2,
            "deleted_lines": 0,
            "removed_lines": 0,
            "additions": 2,
            "deletions": 0,
            "diff": "--- /dev/null\n+++ b/docs/note.txt\n+第一行\n+第二行",
        }
    ]
    assert result.result["files"] == result.result["changes"]
    assert (tmp_path / "docs" / "note.txt").read_text(encoding="utf-8") == "第一行\n第二行\n"


async def test_apply_patch_updates_file_with_matching_context(tmp_path) -> None:
    target = tmp_path / "src" / "app.py"
    target.parent.mkdir()
    target.write_text("alpha\nold\nomega\n", encoding="utf-8")

    result = await _run(
        """*** Begin Patch
*** Update File: src/app.py
@@
 alpha
-old
+new
 omega
*** End Patch""",
        tmp_path,
    )

    assert result.ok is True
    assert result.result["changes"][0]["operation"] == "update"
    assert result.result["changes"][0]["added_lines"] == 1
    assert result.result["changes"][0]["deleted_lines"] == 1
    assert target.read_text(encoding="utf-8") == "alpha\nnew\nomega\n"


async def test_apply_patch_deletes_file_with_removed_line_count(tmp_path) -> None:
    target = tmp_path / "docs" / "old.txt"
    target.parent.mkdir()
    target.write_text("one\ntwo\nthree\n", encoding="utf-8")

    result = await _run(
        """*** Begin Patch
*** Delete File: docs/old.txt
*** End Patch""",
        tmp_path,
    )

    assert result.ok is True
    assert result.result["changes"][0] | {"removed_bytes": 0} == {
        "operation": "update",
        "path": "docs/old.txt",
        "removed_bytes": 0,
        "added_lines": 0,
        "removed_lines": 3,
        "deleted_lines": 3,
        "additions": 0,
        "deletions": 3,
        "diff": "--- a/docs/old.txt\n+++ /dev/null",
    }
    assert result.result["changes"][0]["removed_bytes"] > 0
    assert not target.exists()


async def test_apply_patch_rejects_invalid_patch(tmp_path) -> None:
    result = await _run(
        """*** Begin Patch
*** Add File: broken.txt
missing-plus
*** End Patch""",
        tmp_path,
    )

    assert result.ok is False
    assert result.error["code"] == "invalid_patch"


async def test_apply_patch_error_explains_shorthand_file_header(tmp_path) -> None:
    result = await _run(
        """*** Begin Patch
*** docs/project-structure.md
--- docs/project-structure.md
@@ -1,2 +1,3 @@
 # keydex 项目结构
+> 使用 Mermaid 绘制的完整项目结构图，可在支持 Mermaid 的 Markdown 预览中查看。

*** End Patch""",
        tmp_path,
    )

    assert result.ok is False
    assert result.error["code"] == "invalid_patch"
    assert result.error["details"]["line"] == "*** docs/project-structure.md"
    assert result.error["details"]["expected_headers"] == [
        "*** Add File: <path>",
        "*** Update File: <path>",
        "*** Delete File: <path>",
    ]
    assert "*** Update File: <path>" in result.error["details"]["hint"]


async def test_apply_patch_rejects_workspace_escape(tmp_path) -> None:
    outside = (tmp_path.parent / "outside.txt").resolve()

    result = await _run(
        f"""*** Begin Patch
*** Add File: {outside}
+bad
*** End Patch""",
        tmp_path,
    )

    assert result.ok is False
    assert result.error["code"] == "workspace_path_forbidden"


async def test_apply_patch_rejects_context_mismatch(tmp_path) -> None:
    target = tmp_path / "readme.md"
    target.write_text("current\n", encoding="utf-8")

    result = await _run(
        """*** Begin Patch
*** Update File: readme.md
@@
-old
+new
*** End Patch""",
        tmp_path,
    )

    assert result.ok is False
    assert result.error["code"] == "patch_context_mismatch"
    assert target.read_text(encoding="utf-8") == "current\n"
