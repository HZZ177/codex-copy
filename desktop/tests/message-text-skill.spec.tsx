import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageText } from "@/renderer/pages/conversation/messages";
import { PreviewProvider, usePreview } from "@/renderer/providers/PreviewProvider";
import type { ConversationMessage } from "@/renderer/stores/conversationStore";
import type { RuntimeBridge } from "@/runtime";

describe("MessageText skill context items", () => {
  it("renders a selected skill context item as a non-file chip with description preview", async () => {
    render(
      <MessageText
        message={message("user", "implement this design", "completed", {
          contextItems: [
            {
              id: "skill:dev-plan",
              type: "skill",
              label: "/dev-plan",
              skill_name: "dev-plan",
              description: "Plan work from a design doc",
              source: "workspace",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("dev-plan")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /dev-plan/ })).toBeNull();

    const wrapper = screen.getByText("dev-plan").closest("[data-preview-open]");
    if (!wrapper) {
      throw new Error("skill chip wrapper not found");
    }
    fireEvent.mouseEnter(wrapper);

    await waitFor(() => {
      expect(screen.getByText("Plan work from a design doc")).not.toBeNull();
    });
  });

  it("renders historical skill context metadata without requiring the current catalog", () => {
    render(
      <MessageText
        message={message("user", "", "completed", {
          contextItems: [
            {
              id: "skill:dev-plan",
              type: "skill",
              label: "dev-plan",
              content: "Keydex Skill: dev-plan",
              metadata: {
                skill_name: "dev-plan",
                description: "Historical plan skill",
                source: "workspace",
              },
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("dev-plan")).not.toBeNull();
  });

  it("opens a historical skill definition when locator metadata is available", () => {
    render(
      <PreviewProvider>
        <MessageText
          message={message("user", "", "completed", {
            contextItems: [
              {
                id: "skill:dev-plan",
                type: "skill",
                label: "dev-plan",
                metadata: {
                  skill_name: "dev-plan",
                  description: "Historical plan skill",
                  locator: ".keydex/skills/dev-plan/SKILL.md",
                  source: "workspace",
                },
              },
            ],
          })}
          workspaceRuntime={{} as RuntimeBridge}
          workspaceScope={{ sessionId: "ses-1" }}
        />
        <FilePanelProbe />
      </PreviewProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开 Skill dev-plan" }));

    expect(screen.getByTestId("file-panel-request").textContent).toBe(
      "session:ses-1:.keydex/skills/dev-plan/SKILL.md",
    );
    expect(document.querySelector('[data-context-chip-icon="skill"]')).not.toBeNull();
  });
});

function message(
  kind: ConversationMessage["kind"],
  content: string,
  status: ConversationMessage["status"],
  payload: Record<string, unknown> = {},
): ConversationMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    kind,
    status,
    content,
    payload,
    createdAt: "2026-06-17T10:00:00Z",
    updatedAt: "2026-06-17T10:01:00Z",
  };
}

function FilePanelProbe() {
  const preview = usePreview();
  const request = preview.filePanelRequest;
  return <output data-testid="file-panel-request">{request ? `${request.scopeKey}:${request.path}` : ""}</output>;
}
