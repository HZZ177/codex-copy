import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SendBox } from "@/renderer/components/chat/SendBox";
import {
  buildSlashCommands,
  defaultSlashCommands,
  filterSlashCommands,
  filterSlashSkills,
  getSlashQuery,
  removeSlashQuery,
  replaceSlashQuery,
} from "@/renderer/components/chat/SlashCommandMenu";

describe("SlashCommandMenu", () => {
  it("parses and filters slash commands", () => {
    expect(getSlashQuery("/")).toBe("");
    expect(getSlashQuery("请 /mod")).toBe("mod");
    expect(getSlashQuery("没有命令")).toBeNull();
    expect(filterSlashCommands(defaultSlashCommands, "model")).toEqual([]);
    expect(filterSlashCommands(defaultSlashCommands, "clear").map((command) => command.id)).toEqual(["clear"]);
    expect(replaceSlashQuery("请 /cle", "/clear ")).toBe("请 /clear ");
    expect(removeSlashQuery("请 /dev")).toBe("请");
  });

  it("builds a top-level workspace skill command and filters skills locally", () => {
    const skills = [
      {
        name: "dev-plan",
        label: "/dev-plan",
        description: "Plan work from a design doc",
        source: "workspace" as const,
        locator: ".keydex/skills/dev-plan/SKILL.md",
      },
    ];
    const commands = buildSlashCommands([
      ...skills,
    ]);

    expect(commands.map((command) => command.id)).toEqual(["skill", "clear"]);
    expect(filterSlashCommands(commands, "plan").map((command) => command.id)).toEqual(["skill"]);
    expect(filterSlashCommands(commands, "clear").map((command) => command.id)).toEqual(["clear"]);
    expect(filterSlashSkills(skills, "plan").map((skill) => skill.name)).toEqual(["dev-plan"]);
  });

  it("opens from SendBox and selects commands with keyboard", () => {
    const onChange = vi.fn();
    render(
      <SendBox
        value="/"
        runtimeState="idle"
        canSend
        canStop={false}
        onChange={onChange}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByTestId("slash-command-menu")).not.toBeNull();
    expect(screen.getByText("/clear")).not.toBeNull();

    const input = screen.getByLabelText("继续输入");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("opens again after the dismissed slash query is removed and typed again", () => {
    const { rerender } = render(
      <SendBox
        value="/"
        runtimeState="idle"
        canSend
        canStop={false}
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByTestId("slash-command-menu")).not.toBeNull();
    fireEvent.keyDown(screen.getByLabelText("继续输入"), { key: "Escape" });
    expect(screen.queryByTestId("slash-command-menu")).toBeNull();

    rerender(
      <SendBox
        value=""
        runtimeState="idle"
        canSend
        canStop={false}
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    rerender(
      <SendBox
        value="/"
        runtimeState="idle"
        canSend
        canStop={false}
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByTestId("slash-command-menu")).not.toBeNull();
  });

  it("shows an empty state and does not send when no command matches", () => {
    const onSend = vi.fn();
    render(
      <SendBox
        value="/missing"
        runtimeState="idle"
        canSend
        canStop={false}
        onChange={vi.fn()}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByText("没有匹配的命令")).not.toBeNull();
    fireEvent.keyDown(screen.getByLabelText("继续输入"), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows workspace skills behind the top-level Skill command and reports the selected command", () => {
    const onChange = vi.fn();
    const onSlashCommand = vi.fn();
    render(
      <SendBox
        value="/"
        runtimeState="idle"
        canSend
        canStop={false}
        workspaceSkills={[
          {
            name: "dev-plan",
            label: "/dev-plan",
            description: "Plan work from a design doc",
            source: "workspace",
            locator: ".keydex/skills/dev-plan/SKILL.md",
          },
        ]}
        onChange={onChange}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onSlashCommand={onSlashCommand}
      />,
    );

    expect(screen.getByTestId("slash-command-menu")).not.toBeNull();
    expect(screen.getByText("Skill")).not.toBeNull();

    const input = screen.getByLabelText("继续输入");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("dev-plan")).not.toBeNull();
    fireEvent.keyDown(screen.getByLabelText("继续输入"), { key: "Enter" });

    expect(onSlashCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "skill:dev-plan",
        kind: "skill",
        label: "/dev-plan",
      }),
    );
    expect(onChange).toHaveBeenCalledWith("");
  });
});
