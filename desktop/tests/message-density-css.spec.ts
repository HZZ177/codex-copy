import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("conversation message density CSS contract", () => {
  it("defines compact and overlay variables on MessageList and consumes them in message blocks", () => {
    const messageListCss = readCss("../src/renderer/pages/conversation/messages/MessageList.module.css");
    const messageTextCss = readCss("../src/renderer/pages/conversation/messages/MessageText.module.css");
    const toolCallCss = readCss("../src/renderer/pages/conversation/messages/ToolCallBlock.module.css");
    const fileChangeCss = readCss("../src/renderer/pages/conversation/messages/FileChangeBlock.module.css");

    expect(messageListCss).toContain('.root[data-message-list-variant="compact"]');
    expect(messageListCss).toContain('.root[data-message-list-variant="overlay"]');
    expect(messageListCss).toContain("--message-user-bubble-max-width");
    expect(messageListCss).toContain("--message-tool-detail-width");
    expect(messageTextCss).toContain("var(--message-user-bubble-max-width");
    expect(messageTextCss).toContain("var(--message-context-chip-max-width");
    expect(toolCallCss).toContain("var(--message-tool-detail-width");
    expect(fileChangeCss).toContain("var(--message-tool-detail-width");
  });
});

function readCss(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
