import type { RuntimeBridge } from "@/runtime";
import type { ConversationMessage } from "@/renderer/stores/conversationStore";
import type { AgentChatMessagePayload, AgentSession } from "@/types/protocol";

export const BTW_SESSION_TAG = "btw";
export const BTW_CONVERSATION_TITLE = "旁路对话";
export const BTW_FORK_HISTORY_PAGE_SIZE = 100;

export type ForkSourcePayload = { messageEventId: string } | { turnIndex: number };
export interface BtwConversationHistorySnapshot {
  sessionId: string;
  initialMessageCount: number;
  initialMessageIds: Set<string>;
  loadedTurnCount: number;
  maxLoadedTurnIndex: number | null;
}

export type CreateBtwConversationResult =
  | { session: AgentSession; loadedHistoryTurnCount: number }
  | { error: "missing_session" | "no_source"; message: string };

const NON_FORKABLE_MESSAGE_STATUSES = new Set(["running", "streaming", "failed", "error", "cancelled", "cancelling"]);

export function latestCompleteForkSource(messages: AgentChatMessagePayload[]): ForkSourcePayload | null {
  return latestCompleteForkSourceCandidate(messages)?.source ?? null;
}

function latestCompleteForkSourceCandidate(
  messages: AgentChatMessagePayload[],
): { index: number; source: ForkSourcePayload; turnIndex: number | null } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isCompleteAssistantForkMessage(message)) {
      continue;
    }
    const messageEventId = nonEmptyString(message.messageEventId);
    if (messageEventId) {
      return { index, source: { messageEventId }, turnIndex: numberValue(message.turnIndex) };
    }
    const turnIndex = numberValue(message.turnIndex);
    if (turnIndex !== null) {
      return { index, source: { turnIndex }, turnIndex };
    }
  }
  return null;
}

export async function createBtwConversationFromSession(
  runtime: RuntimeBridge,
  sessionId: string,
): Promise<CreateBtwConversationResult> {
  const cleanedSessionId = sessionId.trim();
  if (!cleanedSessionId) {
    return { error: "missing_session", message: "当前会话无法开启旁路对话" };
  }
  const history = await runtime.conversation.loadHistory(cleanedSessionId, {
    pageSize: BTW_FORK_HISTORY_PAGE_SIZE,
  });
  const candidate = latestCompleteForkSourceCandidate(history.list);
  if (!candidate) {
    return { error: "no_source", message: "没有可派生的完整轮次" };
  }
  const response = await runtime.conversation.forkSession(cleanedSessionId, {
    ...candidate.source,
    sessionTag: BTW_SESSION_TAG,
    title: BTW_CONVERSATION_TITLE,
  });
  return {
    session: response.session,
    loadedHistoryTurnCount:
      candidate.turnIndex ?? countLoadedAgentConversationTurns(history.list.slice(0, candidate.index + 1)),
  };
}

export function countLoadedConversationTurns(messages: ConversationMessage[]): number {
  const userTurnIndexes = new Set<number>();
  const allTurnIndexes = new Set<number>();
  let userMessageCount = 0;
  let assistantMessageCount = 0;

  for (const message of messages) {
    if (message.kind === "user") {
      userMessageCount += 1;
    } else if (message.kind === "assistant") {
      assistantMessageCount += 1;
    }
    const turnIndex = numberValue(message.payload.turnIndex ?? message.payload.turn_index);
    if (turnIndex === null) {
      continue;
    }
    allTurnIndexes.add(turnIndex);
    if (message.kind === "user") {
      userTurnIndexes.add(turnIndex);
    }
  }

  if (userTurnIndexes.size > 0) {
    return userTurnIndexes.size;
  }
  if (allTurnIndexes.size > 0) {
    return allTurnIndexes.size;
  }
  if (userMessageCount > 0) {
    return userMessageCount;
  }
  return assistantMessageCount;
}

export function createBtwConversationHistorySnapshot(
  sessionId: string,
  messages: ConversationMessage[],
  options: { loadedTurnCount?: number | null } = {},
): BtwConversationHistorySnapshot {
  const turnIndexes = messages
    .map((message) => conversationMessageTurnIndex(message))
    .filter((value): value is number => value !== null);
  return {
    sessionId,
    initialMessageCount: messages.length,
    initialMessageIds: new Set(messages.map((message) => message.id)),
    loadedTurnCount: options.loadedTurnCount ?? countLoadedConversationTurns(messages),
    maxLoadedTurnIndex: turnIndexes.length ? Math.max(...turnIndexes) : null,
  };
}

export function filterBtwConversationVisibleMessages(
  messages: ConversationMessage[],
  snapshot: BtwConversationHistorySnapshot,
): ConversationMessage[] {
  return messages.filter((message, index) => {
    if (snapshot.initialMessageIds.has(message.id)) {
      return false;
    }

    const turnIndex = conversationMessageTurnIndex(message);
    if (turnIndex !== null) {
      return snapshot.maxLoadedTurnIndex === null || turnIndex > snapshot.maxLoadedTurnIndex;
    }

    if (isLocalBtwMessage(message.id, snapshot.sessionId)) {
      return index >= snapshot.initialMessageCount;
    }

    return snapshot.maxLoadedTurnIndex === null && index >= snapshot.initialMessageCount;
  });
}

function isCompleteAssistantForkMessage(message: AgentChatMessagePayload): boolean {
  if (message.role !== "assistant" || message.streaming || message.cancelled) {
    return false;
  }
  const status = typeof message.status === "string" ? message.status.toLowerCase() : "";
  return !NON_FORKABLE_MESSAGE_STATUSES.has(status);
}

function countLoadedAgentConversationTurns(messages: AgentChatMessagePayload[]): number {
  const userTurnIndexes = new Set<number>();
  const allTurnIndexes = new Set<number>();
  let userMessageCount = 0;
  let assistantMessageCount = 0;

  for (const message of messages) {
    if (message.role === "user") {
      userMessageCount += 1;
    } else if (message.role === "assistant") {
      assistantMessageCount += 1;
    }
    const turnIndex = numberValue(message.turnIndex);
    if (turnIndex === null) {
      continue;
    }
    allTurnIndexes.add(turnIndex);
    if (message.role === "user") {
      userTurnIndexes.add(turnIndex);
    }
  }

  if (userTurnIndexes.size > 0) {
    return userTurnIndexes.size;
  }
  if (allTurnIndexes.size > 0) {
    return allTurnIndexes.size;
  }
  if (userMessageCount > 0) {
    return userMessageCount;
  }
  return assistantMessageCount;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function conversationMessageTurnIndex(message: ConversationMessage): number | null {
  return numberValue(message.payload.turnIndex ?? message.payload.turn_index);
}

const LOCAL_BTW_MESSAGE_PREFIXES = [
  "approval",
  "assistant",
  "cancelled",
  "compression",
  "error",
  "reasoning",
  "subagent",
  "subagent-text",
  "subagent-tool",
  "system",
  "tool",
  "tool-progress",
  "user",
];

function isLocalBtwMessage(messageId: string, sessionId: string): boolean {
  return LOCAL_BTW_MESSAGE_PREFIXES.some((prefix) => messageId.startsWith(`agent:${prefix}:${sessionId}:`));
}
