import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RuntimeBridge } from "@/runtime";
import { MessageList } from "@/renderer/pages/conversation/messages";
import { PreviewProvider, usePreview } from "@/renderer/providers/PreviewProvider";
import type { ConversationMessage } from "@/renderer/stores/conversationStore";

describe("SkillActivationBlock", () => {
  it("renders load_skill activation as a skill message and opens the skill file panel", () => {
    render(
      <PreviewProvider>
        <MessageList
          messages={[loadSkillMessage()]}
          workspaceRuntime={{} as RuntimeBridge}
          workspaceScope={{ sessionId: "ses-1" }}
        />
        <FilePanelProbe />
      </PreviewProvider>,
    );

    expect(screen.getByTestId("skill-activation-block")).not.toBeNull();
    expect(screen.queryByTestId("tool-call-block")).toBeNull();
    expect(screen.getByTestId("skill-activation-block").querySelector("svg.lucide-sparkles")).not.toBeNull();
    expect(screen.getByText("dev-plan")).not.toBeNull();
    expect(screen.queryByText("已激活")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "打开 Skill dev-plan" }));

    expect(screen.getByTestId("file-panel-request").textContent).toBe(
      "session:ses-1:.keydex/skills/dev-plan/SKILL.md",
    );
  });

  it("opens a skill resource when load_skill is called with resource_path", () => {
    render(
      <PreviewProvider>
        <MessageList
          messages={[
            loadSkillMessage({
              args: { skill_name: "dev-plan", resource_path: "references/detail.md" },
              result: {
                status: "success",
                model_content: JSON.stringify({
                  skill_name: "dev-plan",
                  resource_path: "references/detail.md",
                  found: true,
                  loaded: true,
                  injected: false,
                  message: "Skill resource file loaded.",
                }),
              },
            }),
          ]}
          workspaceRuntime={{} as RuntimeBridge}
          workspaceScope={{ sessionId: "ses-1" }}
        />
        <FilePanelProbe />
      </PreviewProvider>,
    );

    expect(screen.getByText("dev-plan / detail.md")).not.toBeNull();
    expect(screen.queryByText("资源已读取")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "打开 Skill dev-plan" }));

    expect(screen.getByTestId("file-panel-request").textContent).toBe(
      "session:ses-1:.keydex/skills/dev-plan/references/detail.md",
    );
  });
});

function loadSkillMessage({
  args = { skill_name: "dev-plan" },
  result = {
    status: "success",
    model_content: JSON.stringify({
      skill_name: "dev-plan",
      found: true,
      loaded: true,
      injected: true,
      message: "skill 已激活。",
    }),
  },
}: {
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
} = {}): ConversationMessage {
  return {
    id: "skill-1",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    kind: "skill",
    itemType: "tool_call",
    status: "completed",
    content: "load_skill",
    payload: {
      call: {
        id: "call-1",
        name: "load_skill",
        arguments: args,
      },
      result,
    },
    createdAt: "2026-06-17T10:00:00Z",
    updatedAt: "2026-06-17T10:00:02Z",
  };
}

function FilePanelProbe() {
  const preview = usePreview();
  const request = preview.filePanelRequest;
  return <output data-testid="file-panel-request">{request ? `${request.scopeKey}:${request.path}` : ""}</output>;
}
