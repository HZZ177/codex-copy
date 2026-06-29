from __future__ import annotations

from dataclasses import dataclass

from langchain_core.messages import HumanMessage, SystemMessage

L1_SYSTEM_PROMPT = """你正在执行【L1区压缩任务】。

目标：
将给定的“尚未压缩过的原始历史对话消息”压缩为 L1 结构化活动日志。

输入特点：
- 输入已经按“用户轮次”结构化整理；
- 每个轮次内可能包含：用户输入、AI响应、AI发起工具调用、工具结果；
- 工具结果可能已经被结构化截断，必须优先保留其中真正影响后续推理的结论、数据、错误信息与约束。

要求：
1. 保留用户目标、关键约束、关键事实、关键工具结果、明确中间结论、未完成事项；
2. 保持对话推进线索，按任务演进组织内容，避免纯流水账；
3. 对工具调用只保留有价值的结果、失败原因、关键返回数据，不保留冗余细节；
4. 丢弃低价值寒暄、重复表达、无意义噪音；
5. 不要编造信息；
6. 输出体量必须严格控制在 5000 tokens 以内，优先保留高价值信息，必要时进一步压缩表达；
7. 仅通过你自己的输出控制保持内容凝练，不要冗长展开；
8. 只输出压缩结果正文，不要添加标题、解释、标签、引号、前后缀。"""

L2_SYSTEM_PROMPT = """你正在执行【L2区压缩任务】。

目标：
将给定的“已经压缩过一次的 L1 活动日志”进一步压缩为更稳定的 L2 摘要。

要求：
1. 保留长期有效的目标、关键事实、关键决定、关键约束、未完成事项；
2. 去除短期上下文、过程性噪音和重复表述；
3. 输出应更凝练、更适合长期保留；
4. 输出体量必须严格控制在 1500 tokens 以内，只保留最值得长期存档的信息；
5. 仅通过你自己的输出控制保持内容简洁，不要冗长展开；
6. 不要编造信息；
7. 只输出压缩结果正文，不要添加标题、解释、标签、引号、前后缀。"""


@dataclass(slots=True)
class CompressionPromptBundle:
    system_message: SystemMessage
    human_message: HumanMessage


def build_l1_prompt(raw_messages_text: str) -> CompressionPromptBundle:
    return CompressionPromptBundle(
        system_message=SystemMessage(content=L1_SYSTEM_PROMPT),
        human_message=HumanMessage(
            content=(
                "以下是当前需要压缩为 L1 的原始历史对话消息。"
                "输入已经按用户轮次结构化，你需要基于这些轮次生成结构化活动日志：\n\n"
                f"{raw_messages_text}"
            )
        ),
    )


def build_l2_prompt(existing_l1_text: str) -> CompressionPromptBundle:
    return CompressionPromptBundle(
        system_message=SystemMessage(content=L2_SYSTEM_PROMPT),
        human_message=HumanMessage(
            content=(
                "以下是当前需要压缩为 L2 的 L1 活动日志原文，"
                "请提炼长期保留价值更高的信息：\n\n"
                f"{existing_l1_text}"
            )
        ),
    )
