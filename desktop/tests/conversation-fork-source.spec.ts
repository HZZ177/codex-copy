import { describe, expect, it } from "vitest";

import {
  createBtwConversationFromSession,
  createBtwConversationHistorySnapshot,
  filterBtwConversationVisibleMessages,
  latestCompleteForkSource,
} from "@/renderer/pages/conversation/conversationForkSource";
import type { RuntimeBridge } from "@/runtime";
import type { ConversationMessage } from "@/renderer/stores/conversationStore";
import type { AgentChatMessagePayload, AgentSession } from "@/types/protocol";

describe("latestCompleteForkSource", () => {
  it("uses the latest complete assistant message and skips incomplete turns", () => {
    const messages: AgentChatMessagePayload[] = [
      message("user", "问题 1", { messageEventId: "evt-user-1", turnIndex: 1 }),
      message("assistant", "回答 1", { messageEventId: "evt-ai-1", turnIndex: 1 }),
      message("user", "问题 2", { messageEventId: "evt-user-2", turnIndex: 2 }),
      message("assistant", "回答 2", {
        messageEventId: "evt-ai-2",
        status: "streaming",
        streaming: true,
        turnIndex: 2,
      }),
    ];

    expect(latestCompleteForkSource(messages)).toEqual({ messageEventId: "evt-ai-1" });
  });

  it("falls back to turn index when the complete assistant message has no event id", () => {
    expect(
      latestCompleteForkSource([
        message("user", "问题", { turnIndex: 3 }),
        message("assistant", "回答", { turnIndex: 3 }),
      ]),
    ).toEqual({ turnIndex: 3 });
  });

  it("returns null when no complete assistant message exists", () => {
    expect(
      latestCompleteForkSource([
        message("user", "问题", { messageEventId: "evt-user", turnIndex: 1 }),
        message("assistant", "失败回答", {
          messageEventId: "evt-ai",
          status: "failed",
          turnIndex: 1,
        }),
      ]),
    ).toBeNull();
  });
});

describe("bypass conversation history snapshot", () => {
  it("returns the fork source turn count when creating a bypass conversation", async () => {
    const forkedSession = agentSession({ id: "btw-1", session_tag: "btw" });
    const runtime = {
      conversation: {
        loadHistory: () =>
          Promise.resolve({
            session: agentSession({ id: "source-1" }),
            list: [
              message("user", "问题 1", { turnIndex: 1 }),
              message("assistant", "回答 1", { messageEventId: "evt-ai-1", turnIndex: 1 }),
              message("user", "问题 2", { turnIndex: 2 }),
              message("assistant", "回答 2", { messageEventId: "evt-ai-2", turnIndex: 2 }),
              message("user", "问题 3", { turnIndex: 3 }),
              message("assistant", "回答 3", { messageEventId: "evt-ai-3", turnIndex: 3 }),
            ],
            total: 6,
            page: 1,
            page_size: 100,
            event_total: 6,
            turn_indexes: [1, 2, 3],
          }),
        forkSession: () => Promise.resolve({ session: forkedSession, source: {} }),
      },
    } as unknown as RuntimeBridge;

    await expect(createBtwConversationFromSession(runtime, "source-1")).resolves.toMatchObject({
      session: forkedSession,
      loadedHistoryTurnCount: 3,
    });
  });

  it("keeps the loaded turn count fixed and hides reloaded historical messages", () => {
    const initialHistory = [
      conversationMessage("agent:hist:btw-1:1:user", "user", "历史用户消息 1", 1),
      conversationMessage("agent:hist:btw-1:1:assistant", "assistant", "历史助手消息 1", 1),
      conversationMessage("agent:hist:btw-1:2:user", "user", "历史用户消息 2", 2),
      conversationMessage("agent:hist:btw-1:2:assistant", "assistant", "历史助手消息 2", 2),
    ];
    const snapshot = createBtwConversationHistorySnapshot("btw-1", initialHistory);

    expect(snapshot.loadedTurnCount).toBe(2);
    expect(
      filterBtwConversationVisibleMessages(
        [
          ...initialHistory,
          conversationMessage("agent:user:btw-1:1", "user", "新问题"),
        ],
        snapshot,
      ).map((message) => message.content),
    ).toEqual(["新问题"]);

    const refreshedMessages = [
      conversationMessage("agent:hist:btw-1:changed-1:user", "user", "历史用户消息 1", 1),
      conversationMessage("agent:hist:btw-1:changed-1:assistant", "assistant", "历史助手消息 1", 1),
      conversationMessage("agent:hist:btw-1:changed-2:user", "user", "历史用户消息 2", 2),
      conversationMessage("agent:hist:btw-1:changed-2:assistant", "assistant", "历史助手消息 2", 2),
      conversationMessage("agent:hist:btw-1:3:user", "user", "新问题", 3),
      conversationMessage("agent:hist:btw-1:3:assistant", "assistant", "新回答", 3),
    ];

    expect(filterBtwConversationVisibleMessages(refreshedMessages, snapshot).map((message) => message.content)).toEqual(
      ["新问题", "新回答"],
    );
    expect(snapshot.loadedTurnCount).toBe(2);
  });
});

function message(
  role: AgentChatMessagePayload["role"],
  content: string,
  overrides: Partial<AgentChatMessagePayload> = {},
): AgentChatMessagePayload {
  return {
    role,
    content,
    timestamp: 0,
    ...overrides,
  };
}

function agentSession(patch: Partial<AgentSession> = {}): AgentSession {
  return {
    id: "ses-1",
    user_id: "local-user",
    scene_id: "desktop-agent",
    status: "active",
    title: "测试对话",
    session_tag: "chat",
    session_type: "chat",
    workspace_id: null,
    cwd: null,
    workspace_roots: [],
    workspace: null,
    active_session_id: null,
    parent_session_id: null,
    child_session_id: null,
    source_trace_id: null,
    created_at: "2026-06-17T10:00:00Z",
    updated_at: "2026-06-17T10:00:00Z",
    is_debug: false,
    is_scheduled: false,
    is_current: true,
    current_model_provider_id: "provider-1",
    current_model: "qwen-coder",
    ...patch,
  } as AgentSession;
}

function conversationMessage(
  id: string,
  kind: ConversationMessage["kind"],
  content: string,
  turnIndex?: number,
): ConversationMessage {
  return {
    id,
    threadId: "btw-1",
    turnId: null,
    itemId: null,
    kind,
    content,
    payload: {
      turnIndex,
      turn_index: turnIndex,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
