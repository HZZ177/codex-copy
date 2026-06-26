from __future__ import annotations

from typing import Annotated, Any

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

PENDING_SKILL_ACTIVATIONS_RESET_MARKER = "__keydex_pending_skill_activations_reset__"


def merge_pending_skill_activations(left: Any, right: Any) -> list[dict[str, Any]]:
    left_list = list(left or [])
    right_list = list(right or [])
    if len(right_list) == 1 and right_list[0] == PENDING_SKILL_ACTIVATIONS_RESET_MARKER:
        return []
    if not right_list:
        return left_list
    return left_list + right_list


def build_pending_skill_activations_reset_update() -> dict[str, list[str]]:
    return {
        "pending_skill_activations": [PENDING_SKILL_ACTIVATIONS_RESET_MARKER],
    }


class KeydexAgentState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
    pending_skill_activations: Annotated[
        list[dict[str, Any]],
        merge_pending_skill_activations,
    ]
