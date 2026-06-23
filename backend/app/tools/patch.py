from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from backend.app.agent.tool_call_progress import count_text_lines, finalize_file_change
from backend.app.core.logger import logger
from backend.app.security.workspace import WorkspacePathError, resolve_workspace_path
from backend.app.tools.base import FunctionTool, ToolExecutionContext, ToolExecutionError
from backend.app.tools.registry import ToolRegistry

APPLY_PATCH_USAGE = """在当前工作区内应用 Codex apply_patch 风格的文本补丁。

patch 必须严格使用以下文件操作头，不能使用普通 unified diff 文件头：
- *** Add File: <path>
- *** Update File: <path>
- *** Delete File: <path>

更新文件示例：
*** Begin Patch
*** Update File: docs/project-structure.md
@@
 # keydex 项目结构
+> 使用 Mermaid 绘制的完整项目结构图，可在支持 Mermaid 的 Markdown 预览中查看。

*** End Patch

新增文件示例：
*** Begin Patch
*** Add File: docs/note.md
+第一行
+第二行
*** End Patch

删除文件示例：
*** Begin Patch
*** Delete File: docs/old.md
*** End Patch

禁止写法：不要写 `*** docs/file.md`、`--- docs/file.md`、`+++ docs/file.md` 或只包含 `@@ -1,2 +1,3 @@` 的普通 diff。"""

PATCH_PARAMETER_DESCRIPTION = """完整 patch 文本。必须以 `*** Begin Patch` 开始、以 `*** End Patch` 结束。
每个文件操作必须使用 `*** Add File: <path>`、`*** Update File: <path>` 或 `*** Delete File: <path>`。
Update File 内容行只能以空格、+、- 或 @@ 开头；普通上下文行前面必须保留一个空格。"""

PATCH_EXPECTED_HEADERS = [
    "*** Add File: <path>",
    "*** Update File: <path>",
    "*** Delete File: <path>",
]


@dataclass(frozen=True)
class PatchOperation:
    kind: str
    path: str
    lines: list[str]


def create_patch_tools() -> list[FunctionTool]:
    return [
        FunctionTool(
            name="apply_patch",
            description=APPLY_PATCH_USAGE,
            parameters={
                "type": "object",
                "properties": {
                    "patch": {
                        "type": "string",
                        "description": PATCH_PARAMETER_DESCRIPTION,
                    }
                },
                "required": ["patch"],
            },
            handler=apply_patch_tool,
        )
    ]


def register_patch_tools(registry: ToolRegistry) -> ToolRegistry:
    for tool in create_patch_tools():
        registry.register(tool)
    return registry


async def apply_patch_tool(
    args: dict[str, Any],
    context: ToolExecutionContext,
) -> dict[str, Any]:
    patch = args.get("patch")
    if not isinstance(patch, str) or not patch.strip():
        raise ToolExecutionError("patch 必须是非空字符串", code="invalid_tool_args")

    operations = _parse_patch(patch)
    changes: list[dict[str, Any]] = []
    for operation in operations:
        target = _resolve(operation.path, context)
        if operation.kind == "add":
            changes.append(_apply_add(target, operation, context))
        elif operation.kind == "update":
            changes.append(_apply_update(target, operation, context))
        elif operation.kind == "delete":
            changes.append(_apply_delete(target, operation, context))
        else:
            raise ToolExecutionError(
                "不支持的 patch 操作",
                code="invalid_patch",
                details={"operation": operation.kind},
            )

    logger.info(
        "[PatchTool] 应用补丁完成 | "
        f"changes={len(changes)} | summary={_summarize_changes(changes)}"
    )
    return {"changes": changes, "files": changes}


def _parse_patch(patch: str) -> list[PatchOperation]:
    lines = patch.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    while lines and lines[-1] == "":
        lines.pop()
    if not lines or lines[0] != "*** Begin Patch":
        raise ToolExecutionError("patch 必须以 *** Begin Patch 开始", code="invalid_patch")
    if len(lines) < 2 or lines[-1] != "*** End Patch":
        raise ToolExecutionError("patch 必须以 *** End Patch 结束", code="invalid_patch")

    operations: list[PatchOperation] = []
    index = 1
    while index < len(lines) - 1:
        header = lines[index]
        if header.startswith("*** Add File: "):
            index = _collect_operation(lines, index, "add", "*** Add File: ", operations)
        elif header.startswith("*** Update File: "):
            index = _collect_operation(lines, index, "update", "*** Update File: ", operations)
        elif header.startswith("*** Delete File: "):
            path = header.removeprefix("*** Delete File: ").strip()
            if not path:
                raise ToolExecutionError("Delete File 缺少路径", code="invalid_patch")
            operations.append(PatchOperation(kind="delete", path=path, lines=[]))
            index += 1
        else:
            _raise_unrecognized_patch_line(header, index + 1)

    if not operations:
        raise ToolExecutionError("patch 没有任何文件操作", code="invalid_patch")
    return operations


def _raise_unrecognized_patch_line(line: str, line_number: int) -> None:
    hint = "文件操作头必须写成 `*** Update File: <path>`、`*** Add File: <path>` 或 `*** Delete File: <path>`。"
    if line.startswith("*** ") and ":" not in line:
        hint = (
            "看起来你写成了 `*** <path>`。这不是有效的 apply_patch 文件头；"
            "如果要修改已有文件，请改成 `*** Update File: <path>`。"
        )
    elif line.startswith("--- ") or line.startswith("+++ ") or line.startswith("@@ -"):
        hint = (
            "当前工具不接受普通 unified diff 文件头。请先写 `*** Update File: <path>`，"
            "然后在其后放置以空格、+、- 或 @@ 开头的变更行。"
        )
    raise ToolExecutionError(
        "无法识别的 patch 行",
        code="invalid_patch",
        details={
            "line": line,
            "line_number": line_number,
            "expected_headers": PATCH_EXPECTED_HEADERS,
            "hint": hint,
        },
    )


def _collect_operation(
    lines: list[str],
    index: int,
    kind: str,
    prefix: str,
    operations: list[PatchOperation],
) -> int:
    path = lines[index].removeprefix(prefix).strip()
    if not path:
        raise ToolExecutionError(f"{prefix.strip()} 缺少路径", code="invalid_patch")

    index += 1
    body: list[str] = []
    while index < len(lines) - 1 and not lines[index].startswith("*** "):
        body.append(lines[index])
        index += 1
    if not body:
        raise ToolExecutionError("文件操作缺少 patch 内容", code="invalid_patch")
    operations.append(PatchOperation(kind=kind, path=path, lines=body))
    return index


def _apply_add(
    target: Path,
    operation: PatchOperation,
    context: ToolExecutionContext,
) -> dict[str, Any]:
    if target.exists():
        raise ToolExecutionError(
            "新增文件已存在",
            code="patch_target_exists",
            details={"path": _relative(target, context)},
        )
    content_lines = []
    for line in operation.lines:
        if not line.startswith("+"):
            raise ToolExecutionError("Add File 行必须以 + 开头", code="invalid_patch")
        content_lines.append(line[1:])
    content = "\n".join(content_lines)
    if content_lines:
        content += "\n"

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8", newline="")
    return finalize_file_change({
        "operation": "update",
        "path": _relative(target, context),
        "added_lines": len(content_lines),
        "removed_lines": 0,
        "diff": _operation_diff(_relative(target, context), "add", operation.lines),
    })


def _apply_update(
    target: Path,
    operation: PatchOperation,
    context: ToolExecutionContext,
) -> dict[str, Any]:
    if not target.exists():
        raise ToolExecutionError(
            "更新文件不存在",
            code="file_not_found",
            details={"path": _relative_missing(target, context)},
        )
    if not target.is_file():
        raise ToolExecutionError(
            "更新目标不是文件",
            code="path_not_file",
            details={"path": _relative(target, context)},
        )
    try:
        original = target.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise ToolExecutionError(
            "文件不是 UTF-8 文本",
            code="file_not_text",
            details={"path": _relative(target, context)},
        ) from exc

    old_block, new_block, added, removed = _build_update_blocks(operation.lines)
    if old_block not in original:
        raise ToolExecutionError(
            "patch 上下文不匹配，拒绝覆盖当前文件",
            code="patch_context_mismatch",
            details={"path": _relative(target, context)},
        )

    updated = original.replace(old_block, new_block, 1)
    target.write_text(updated, encoding="utf-8", newline="")
    return finalize_file_change({
        "operation": "update",
        "path": _relative(target, context),
        "added_lines": added,
        "removed_lines": removed,
        "diff": _operation_diff(_relative(target, context), "update", operation.lines),
    })


def _apply_delete(
    target: Path,
    operation: PatchOperation,
    context: ToolExecutionContext,
) -> dict[str, Any]:
    if not target.exists():
        raise ToolExecutionError(
            "删除文件不存在",
            code="file_not_found",
            details={"path": _relative_missing(target, context)},
        )
    if not target.is_file():
        raise ToolExecutionError(
            "删除目标不是文件",
            code="path_not_file",
            details={"path": _relative(target, context)},
        )
    size = target.stat().st_size
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise ToolExecutionError(
            "文件不是 UTF-8 文本",
            code="file_not_text",
            details={"path": _relative(target, context)},
        ) from exc
    removed_lines = count_text_lines(content)
    target.unlink()
    return finalize_file_change({
        "operation": "update",
        "path": _relative_missing(target, context),
        "removed_bytes": size,
        "added_lines": 0,
        "removed_lines": removed_lines,
        "diff": _operation_diff(_relative_missing(target, context), "delete", operation.lines),
    })


def _operation_diff(path: str, operation: str, lines: list[str]) -> str:
    if operation == "add":
        header = ["--- /dev/null", f"+++ b/{path}"]
    elif operation == "delete":
        header = [f"--- a/{path}", "+++ /dev/null"]
    else:
        header = [f"--- a/{path}", f"+++ b/{path}"]
    return "\n".join([*header, *lines])


def _build_update_blocks(lines: list[str]) -> tuple[str, str, int, int]:
    old_lines: list[str] = []
    new_lines: list[str] = []
    added = 0
    removed = 0
    for line in lines:
        if line == "@@" or line.startswith("@@ "):
            continue
        if line.startswith(" "):
            value = line[1:]
            old_lines.append(value)
            new_lines.append(value)
        elif line.startswith("-"):
            old_lines.append(line[1:])
            removed += 1
        elif line.startswith("+"):
            new_lines.append(line[1:])
            added += 1
        else:
            raise ToolExecutionError(
                "Update File 内容行必须以空格、+、- 或 @@ 开头",
                code="invalid_patch",
            )

    if not old_lines and not new_lines:
        raise ToolExecutionError("Update File 缺少有效变更", code="invalid_patch")
    return "\n".join(old_lines) + "\n", "\n".join(new_lines) + "\n", added, removed


def _resolve(raw_path: str, context: ToolExecutionContext) -> Path:
    try:
        return resolve_workspace_path(
            raw_path,
            cwd=context.workspace_root,
            workspace_roots=[context.workspace_root],
        )
    except WorkspacePathError as exc:
        raise ToolExecutionError(
            str(exc),
            code="workspace_path_forbidden",
            details={"path": raw_path},
        ) from exc


def _relative(path: Path, context: ToolExecutionContext) -> str:
    return path.resolve().relative_to(context.workspace_root).as_posix()


def _relative_missing(path: Path, context: ToolExecutionContext) -> str:
    return path.resolve().relative_to(context.workspace_root).as_posix()


def _summarize_changes(changes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "operation": change.get("operation"),
            "path": change.get("path"),
            "added_lines": change.get("added_lines"),
            "removed_lines": change.get("removed_lines"),
            "removed_bytes": change.get("removed_bytes"),
        }
        for change in changes
    ]
