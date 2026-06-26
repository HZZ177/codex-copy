import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ComposerApprovalCard } from "@/renderer/pages/conversation/ComposerApprovalCard";
import type { CommandApprovalRequest } from "@/types/protocol";

describe("ComposerApprovalCard", () => {
  it("selects once, exact trust, prefix trust and reject decisions before submitting", async () => {
    const onSubmit = vi.fn();

    render(<ComposerApprovalCard approval={approval()} allowPersistentTrust onSubmit={onSubmit} />);

    expect(screen.getByTestId("composer-approval-card")).not.toBeNull();
    expect(screen.getByText("是否允许执行命令？")).not.toBeNull();
    expect(screen.getByText("D:/repo")).not.toBeNull();
    expect(screen.getByTestId("composer-approval-command").textContent).toContain("pnpm test");
    expect(screen.getByRole("radio", { name: "是" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByPlaceholderText("告诉 agent 如何调整")).toBeNull();

    const group = screen.getByRole("radiogroup", { name: "命令审批选项" });
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: "是，且以后相同命令不再询问" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(screen.getByRole("radio", { name: "是" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(screen.getByRole("radio", { name: "否，请告知 agent 如何调整" }).getAttribute("aria-checked")).toBe("true");
    await waitFor(() => {
      expect(screen.getByPlaceholderText("告诉 agent 如何调整")).toBe(document.activeElement);
    });
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: "是" }).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("radio", { name: "是" }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("radio", { name: "是" }), { key: "Enter" });
    expect(onSubmit).toHaveBeenLastCalledWith({ decision: "approved", trust_scope: "once" });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ decision: "approved", trust_scope: "once" });

    fireEvent.click(screen.getByRole("radio", { name: "是，且以后相同命令不再询问" }));
    expect(screen.getByRole("radio", { name: "是，且以后相同命令不再询问" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      decision: "approved",
      trust_scope: "persistent",
      rule_match_type: "exact",
    });

    fireEvent.click(screen.getByRole("radio", { name: "是，且以后以该前缀开头的命令不再询问" }));
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      decision: "approved",
      trust_scope: "persistent",
      rule_match_type: "prefix",
    });

    fireEvent.click(screen.getByRole("radio", { name: "否，请告知 agent 如何调整" }));
    expect(screen.getByRole("radio", { name: "否，请告知 agent 如何调整" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("composer-approval-reject-panel")).not.toBeNull();
    fireEvent.change(screen.getByPlaceholderText("告诉 agent 如何调整"), { target: { value: "请改成只读命令" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      decision: "rejected",
      trust_scope: "once",
      reject_message: "请改成只读命令",
    });

    fireEvent.click(screen.getByRole("radio", { name: "是" }));
    expect((screen.getByPlaceholderText("告诉 agent 如何调整") as HTMLTextAreaElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "跳过" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ decision: "rejected", trust_scope: "once" });
  });

  it("hides persistent trust actions when persistent trust is disabled", () => {
    const onSubmit = vi.fn();

    render(<ComposerApprovalCard approval={approval()} allowPersistentTrust={false} error="审批提交失败" onSubmit={onSubmit} />);

    expect(screen.getByText("审批提交失败")).not.toBeNull();
    expect(screen.getByRole("radio", { name: "是" })).not.toBeNull();
    expect(screen.getByRole("radio", { name: "否，请告知 agent 如何调整" })).not.toBeNull();
    expect(screen.queryByRole("radio", { name: "是，且以后相同命令不再询问" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "是，且以后以该前缀开头的命令不再询问" })).toBeNull();
    expect(screen.getByRole("button", { name: "提交" })).not.toBeNull();
  });

  it("omits generic workspace copy and dot cwd from the approval card", () => {
    const onSubmit = vi.fn();

    render(
      <ComposerApprovalCard
        approval={{
          ...approval(),
          description: "这个命令将在当前工作区执行。",
          details: {
            ...approval().details,
            cwd: ".",
          },
        }}
        allowPersistentTrust
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByText("这个命令将在当前工作区执行。")).toBeNull();
    expect(screen.queryByTestId("composer-approval-cwd")).toBeNull();
    expect(screen.getByTestId("composer-approval-command").textContent).toContain("pnpm test");
  });

  it("scrolls long expanded commands and submits reject reason with Enter", async () => {
    const onSubmit = vi.fn();
    const longCommand = Array.from({ length: 12 }, (_, index) => `echo line-${index + 1}`).join("\n");

    render(
      <ComposerApprovalCard
        approval={{
          ...approval(),
          details: {
            ...approval().details,
            command: longCommand,
          },
        }}
        allowPersistentTrust
        onSubmit={onSubmit}
      />,
    );

    const command = screen.getByTestId("composer-approval-command");
    expect(command.getAttribute("data-expanded")).toBe("false");
    expect(command.textContent).not.toContain("line-12");

    fireEvent.click(screen.getByRole("button", { name: "展开" }));

    await waitFor(() => {
      expect(command.getAttribute("data-expanded")).toBe("true");
      expect(command.getAttribute("tabindex")).toBe("0");
      expect(command.textContent).toContain("line-12");
    });

    fireEvent.click(screen.getByRole("radio", { name: "否，请告知 agent 如何调整" }));
    const textarea = await screen.findByPlaceholderText("告诉 agent 如何调整");
    fireEvent.change(textarea, { target: { value: "请改为只读检查" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSubmit).toHaveBeenLastCalledWith({
      decision: "rejected",
      trust_scope: "once",
      reject_message: "请改为只读检查",
    });
  });
});

function approval(): CommandApprovalRequest {
  return {
    id: "approval-1",
    session_id: "session-1",
    thread_id: "session-1",
    turn_id: "turn-1",
    item_id: "item-command",
    call_id: "call-command",
    run_id: "run-command",
    tool_name: "run_command",
    kind: "exec",
    title: "是否允许执行命令？",
    description: "命令会在当前工作区执行。",
    details: {
      command: "pnpm test",
      cwd: "D:/repo",
      suggested_exact_rule: "pnpm test",
      suggested_prefix_rule: "pnpm --dir desktop",
    },
    status: "pending",
    created_at: "2026-06-24T10:00:00Z",
    resolved_at: null,
  };
}
