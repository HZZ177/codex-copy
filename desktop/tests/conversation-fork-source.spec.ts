import { describe, expect, it } from "vitest";

import { latestCompleteForkSource } from "@/renderer/pages/conversation/conversationForkSource";
import type { AgentChatMessagePayload } from "@/types/protocol";

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
