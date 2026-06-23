from __future__ import annotations

from langchain_core.messages import AIMessageChunk

from backend.app.agent.tool_call_progress import (
    ToolCallChunkPipeline,
    extract_partial_json_string_field,
    parse_apply_patch_file_changes,
    parse_partial_json_object,
)


def test_partial_json_string_field_returns_incomplete_streamed_value() -> None:
    raw = '{"patch":"*** Begin Patch\\n*** Add File: src/app.py\\n+print('

    assert extract_partial_json_string_field(raw, "patch") == (
        "*** Begin Patch\n*** Add File: src/app.py\n+print("
    )
    assert parse_partial_json_object(raw)["patch"].startswith("*** Begin Patch")


def test_apply_patch_file_change_parser_counts_added_and_deleted_lines() -> None:
    files = parse_apply_patch_file_changes(
        """*** Begin Patch
*** Update File: src/app.py
@@
 keep
-old
+new
*** Add File: docs/note.md
+hello
+world
*** End Patch"""
    )

    assert files == [
        {
            "path": "src/app.py",
            "operation": "update",
            "added_lines": 1,
            "deleted_lines": 1,
            "removed_lines": 1,
            "additions": 1,
            "deletions": 1,
            "diff": "--- a/src/app.py\n+++ b/src/app.py\n@@\n keep\n-old\n+new",
        },
        {
            "path": "docs/note.md",
            "operation": "add",
            "added_lines": 2,
            "deleted_lines": 0,
            "removed_lines": 0,
            "additions": 2,
            "deletions": 0,
            "diff": "--- /dev/null\n+++ b/docs/note.md\n+hello\n+world",
        },
    ]


def test_pipeline_emits_progress_for_streamed_apply_patch_chunks() -> None:
    pipeline = ToolCallChunkPipeline()
    first = AIMessageChunk(
        content="",
        tool_call_chunks=[
            {
                "id": "call_patch",
                "index": 0,
                "name": "apply_patch",
                "args": '{"patch":"*** Begin Patch\\n*** Add File: src/app.py\\n+one',
            }
        ],
    )
    second = AIMessageChunk(
        content="",
        tool_call_chunks=[
            {
                "id": "call_patch",
                "index": 0,
                "name": None,
                "args": '\\n+two\\n*** End Patch"}',
            }
        ],
    )

    first_progress = pipeline.process_chunk(first, model_run_id="model_run")
    second_progress = pipeline.process_chunk(second, model_run_id="model_run")

    assert first_progress[0]["tool"] == "apply_patch"
    assert first_progress[0]["tool_call_id"] == "call_patch"
    assert first_progress[0]["files"][0]["path"] == "src/app.py"
    assert first_progress[0]["files"][0]["operation"] == "update"
    assert first_progress[0]["files"][0]["added_lines"] == 1
    assert second_progress[0]["files"][0]["operation"] == "update"
    assert second_progress[0]["files"][0]["added_lines"] == 2


def test_pipeline_merges_openai_argument_chunks_by_index_after_first_id() -> None:
    pipeline = ToolCallChunkPipeline()

    pipeline.process_chunk(
        AIMessageChunk(
            content="",
            tool_call_chunks=[
                {
                    "id": "call_patch",
                    "index": 0,
                    "name": "apply_patch",
                    "args": "",
                }
            ],
        ),
        model_run_id="model_run",
    )
    progress = pipeline.process_chunk(
        AIMessageChunk(
            content="",
            tool_call_chunks=[
                {
                    "id": None,
                    "index": 0,
                    "name": None,
                    "args": (
                        '{"patch":"*** Begin Patch\\n'
                        "*** Add File: src/app.py\\n+one\"}"
                    ),
                }
            ],
        ),
        model_run_id="model_run",
    )

    assert progress[0]["tool"] == "apply_patch"
    assert progress[0]["tool_call_id"] == "call_patch"
    assert progress[0]["files"][0]["path"] == "src/app.py"


def test_pipeline_handles_interleaved_write_file_tool_calls() -> None:
    pipeline = ToolCallChunkPipeline()
    chunk = AIMessageChunk(
        content="",
        tool_call_chunks=[
            {
                "id": "call_a",
                "index": 0,
                "name": "write_file",
                "args": '{"path":"a.txt","content":"one\\ntwo"}',
            },
            {
                "id": "call_b",
                "index": 1,
                "name": "write_file",
                "args": '{"path":"b.txt","content":"three"}',
            },
        ],
    )

    progress = pipeline.process_chunk(chunk, model_run_id="model_run")

    actual = [
        (
            item["tool_call_id"],
            item["files"][0]["path"],
            item["files"][0]["operation"],
            item["files"][0]["added_lines"],
            item["files"][0]["diff"],
        )
        for item in progress
    ]
    assert actual == [
        ("call_a", "a.txt", "add", 2, "--- /dev/null\n+++ b/a.txt\n@@ -0,0 +1,2 @@\n+one\n+two"),
        ("call_b", "b.txt", "add", 1, "--- /dev/null\n+++ b/b.txt\n@@ -0,0 +1 @@\n+three"),
    ]


def test_pipeline_binds_real_tool_run_to_streamed_tool_call_by_params() -> None:
    pipeline = ToolCallChunkPipeline()
    pipeline.process_chunk(
        AIMessageChunk(
            content="",
            tool_call_chunks=[
                {
                    "id": "call_a",
                    "index": 0,
                    "name": "write_file",
                    "args": '{"path":"a.txt","content":"one\\ntwo"}',
                },
                {
                    "id": "call_b",
                    "index": 1,
                    "name": "write_file",
                    "args": '{"path":"b.txt","content":"three"}',
                },
            ],
        ),
        model_run_id="model_run",
    )

    tool_call_id = pipeline.bind_tool_run(
        run_id="tool_run_b",
        tool_name="write_file",
        params={"path": "b.txt", "content": "three"},
    )

    assert tool_call_id == "call_b"
    assert pipeline.tool_call_id_for_run("tool_run_b") == "call_b"


def test_pipeline_marks_write_file_progress_as_create_by_tool_name() -> None:
    pipeline = ToolCallChunkPipeline()
    chunk = AIMessageChunk(
        content="",
        tool_call_chunks=[
            {
                "id": "call_write",
                "index": 0,
                "name": "write_file",
                "args": '{"path":"a.txt","content":"new\\nsame\\n"}',
            },
        ],
    )

    progress = pipeline.process_chunk(chunk, model_run_id="model_run")

    file_change = progress[0]["files"][0]
    assert file_change["operation"] == "add"
    assert file_change["added_lines"] == 2
    assert file_change["deleted_lines"] == 0
    assert "+new" in file_change["diff"]


def test_pipeline_marks_write_file_progress_as_create_for_new_targets() -> None:
    pipeline = ToolCallChunkPipeline()
    chunk = AIMessageChunk(
        content="",
        tool_call_chunks=[
            {
                "id": "call_write",
                "index": 0,
                "name": "write_file",
                "args": '{"path":"new.txt","content":"hello"}',
            },
        ],
    )

    progress = pipeline.process_chunk(chunk, model_run_id="model_run")

    file_change = progress[0]["files"][0]
    assert file_change["operation"] == "add"
    assert file_change["added_lines"] == 1
    assert file_change["deleted_lines"] == 0
    assert file_change["diff"] == "--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+hello"
