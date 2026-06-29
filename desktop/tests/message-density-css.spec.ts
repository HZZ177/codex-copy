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

  it("keeps single-line ghost rows centered without shifting the whole title group", () => {
    const toolCallCss = readCss("../src/renderer/pages/conversation/messages/ToolCallBlock.module.css");
    const commandCss = readCss("../src/renderer/pages/conversation/messages/CommandExecutionBlock.module.css");
    const fileChangeCss = readCss("../src/renderer/pages/conversation/messages/FileChangeBlock.module.css");
    const groupCss = readCss("../src/renderer/pages/conversation/messages/MessageGroupBlock.module.css");

    expect(cssRule(toolCallCss, ".titleGroup")).not.toContain("transform:");
    expect(cssRule(commandCss, ".titleGroup")).not.toContain("transform:");
    expect(cssRule(fileChangeCss, ".titleGroup")).not.toContain("transform:");
    expect(cssRule(toolCallCss, ".header")).toContain("display: inline-flex");
    expect(cssRule(commandCss, ".header")).toContain("display: inline-flex");
    expect(cssRule(fileChangeCss, ".header")).toContain("display: inline-flex");
    expect(cssRule(toolCallCss, ".header")).not.toContain("grid-template-columns");
    expect(cssRule(commandCss, ".header")).not.toContain("grid-template-columns");
    expect(cssRule(fileChangeCss, ".header")).not.toContain("grid-template-columns");
    expect(cssRule(groupCss, ".title")).toContain("transform: translateY(var(--ghost-text-offset-y))");
  });
});

function readCss(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function cssRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "s"))?.[0] ?? "";
}
