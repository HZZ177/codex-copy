import type { AgentChatMessagePayload } from "@/types/protocol";

export const BTW_SESSION_TAG = "btw";
export const BTW_CONVERSATION_TITLE = "旁路对话";
export const BTW_FORK_HISTORY_PAGE_SIZE = 100;

export type ForkSourcePayload = { messageEventId: string } | { turnIndex: number };

const NON_FORKABLE_MESSAGE_STATUSES = new Set(["running", "streaming", "failed", "error", "cancelled", "cancelling"]);

export function latestCompleteForkSource(messages: AgentChatMessagePayload[]): ForkSourcePayload | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isCompleteAssistantForkMessage(message)) {
      continue;
    }
    const messageEventId = nonEmptyString(message.messageEventId);
    if (messageEventId) {
      return { messageEventId };
    }
    if (typeof message.turnIndex === "number" && Number.isInteger(message.turnIndex)) {
      return { turnIndex: message.turnIndex };
    }
  }
  return null;
}

function isCompleteAssistantForkMessage(message: AgentChatMessagePayload): boolean {
  if (message.role !== "assistant" || message.streaming || message.cancelled) {
    return false;
  }
  const status = typeof message.status === "string" ? message.status.toLowerCase() : "";
  return !NON_FORKABLE_MESSAGE_STATUSES.has(status);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
