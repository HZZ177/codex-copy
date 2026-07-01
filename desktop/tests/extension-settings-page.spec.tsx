import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { ExtensionSettingsPage } from "@/renderer/pages/settings/extensions";
import { NotificationProvider } from "@/renderer/providers/NotificationProvider";
import type { RuntimeBridge } from "@/runtime";
import type { AgentRuntimeSettings, ModelDefaultsResponse } from "@/types/protocol";

describe("ExtensionSettingsPage", () => {
  it("loads extension settings with Codex-style switches", async () => {
    const runtime = fakeRuntime({
      settings: {
        auto_title: { enabled: true, only_when_default_title: true, max_title_length: 48 },
      },
      fastConfigured: true,
    });

    renderWithNotifications(<ExtensionSettingsPage runtime={runtime} />);

    expect(await screen.findByRole("heading", { name: "扩展功能" })).not.toBeNull();
    expect(screen.getByText("功能模块")).not.toBeNull();
    expect(screen.getByText("标题生成")).not.toBeNull();
    expect(screen.getByRole("switch", { name: "启用标题生成" })).toHaveProperty("checked", true);
    expect(screen.queryByRole("switch", { name: "仅默认标题时生成" })).toBeNull();
    expect(screen.getByText("期望标题最大长度")).not.toBeNull();
    expect(screen.getByLabelText("期望标题最大长度")).toHaveProperty("value", "48");
    expect(screen.queryByText("快速模型未配置，标题生成不可用")).toBeNull();
    expect(screen.getAllByRole("button", { name: "保存" })).toHaveLength(1);
  });

  it("saves the whole extension settings page in one request", async () => {
    const saveExtensionSettings = vi.fn((payload: AgentRuntimeSettings) => Promise.resolve(payload));
    const runtime = fakeRuntime({ saveExtensionSettings, fastConfigured: true });

    renderWithNotifications(<ExtensionSettingsPage runtime={runtime} />);

    await screen.findByText("标题生成");
    fireEvent.click(screen.getByRole("switch", { name: "启用标题生成" }));
    fireEvent.change(screen.getByLabelText("期望标题最大长度"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("单轮最多工具调用"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("连续重复阈值"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("switch", { name: "启用上下文压缩" }));
    fireEvent.change(screen.getByLabelText("上下文窗口"), { target: { value: "64000" } });
    fireEvent.change(screen.getByLabelText("触发阈值"), { target: { value: "0.6" } });
    fireEvent.change(screen.getByLabelText("紧急阈值"), { target: { value: "0.92" } });
    fireEvent.change(screen.getByLabelText("保留轮数"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(saveExtensionSettings).toHaveBeenCalledTimes(1);
      expect(saveExtensionSettings).toHaveBeenCalledWith({
        auto_title: {
          enabled: true,
          only_when_default_title: true,
          max_title_length: 50,
        },
        tool_call_limit: {
          enabled: true,
          max_tool_calls: 12,
          exit_behavior: "error",
        },
        duplicate_tool_call_guard: {
          enabled: true,
          max_repeats: 5,
        },
        context_compression: {
          enabled: true,
          context_window_tokens: 64000,
          trigger_fraction: 0.6,
          emergency_fraction: 0.92,
          retain_rounds: 4,
        },
      });
    });
    expect(await screen.findByText("扩展功能配置已保存")).not.toBeNull();
  });

  it("saves disabled switch states through the page-level save button", async () => {
    const saveExtensionSettings = vi.fn((payload: AgentRuntimeSettings) => Promise.resolve(payload));
    const runtime = fakeRuntime({ saveExtensionSettings, fastConfigured: true });

    renderWithNotifications(<ExtensionSettingsPage runtime={runtime} />);

    await screen.findByText("单轮工具调用上限");
    fireEvent.click(screen.getByRole("switch", { name: "启用工具上限" }));
    fireEvent.click(screen.getByRole("switch", { name: "启用重复保护" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(saveExtensionSettings).toHaveBeenCalledWith({
        ...defaultExtensionSettings(),
        tool_call_limit: {
          enabled: false,
          max_tool_calls: 80,
          exit_behavior: "error",
        },
        duplicate_tool_call_guard: {
          enabled: false,
          max_repeats: 3,
        },
      });
    });
  });

  it("blocks enabling title generation when fast model is missing", async () => {
    const saveExtensionSettings = vi.fn();
    const onOpenModelConfig = vi.fn();
    const runtime = fakeRuntime({ saveExtensionSettings, fastConfigured: false });

    renderWithNotifications(
      <ExtensionSettingsPage runtime={runtime} onOpenModelConfig={onOpenModelConfig} />,
    );

    await screen.findByText("标题生成");
    fireEvent.click(screen.getByRole("switch", { name: "启用标题生成" }));

    expect(screen.getByRole("alert").textContent).toContain("快速模型未配置，标题生成不可用");
    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "配置模型" }));

    expect(saveExtensionSettings).not.toHaveBeenCalled();
    expect(onOpenModelConfig).toHaveBeenCalledTimes(1);
  });

  it("blocks enabling context compression when fast model is missing", async () => {
    const saveExtensionSettings = vi.fn();
    const onOpenModelConfig = vi.fn();
    const runtime = fakeRuntime({ saveExtensionSettings, fastConfigured: false });

    renderWithNotifications(
      <ExtensionSettingsPage runtime={runtime} onOpenModelConfig={onOpenModelConfig} />,
    );

    await screen.findByText("上下文压缩");
    fireEvent.click(screen.getByRole("switch", { name: "启用上下文压缩" }));

    expect(screen.getByRole("alert").textContent).toContain("快速模型未配置，上下文压缩不可用");
    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "配置模型" }));

    expect(saveExtensionSettings).not.toHaveBeenCalled();
    expect(onOpenModelConfig).toHaveBeenCalledTimes(1);
  });

  it("disables page save when title length is invalid", async () => {
    const saveExtensionSettings = vi.fn();
    const runtime = fakeRuntime({ saveExtensionSettings });

    renderWithNotifications(<ExtensionSettingsPage runtime={runtime} />);

    await screen.findByText("标题生成");
    fireEvent.change(screen.getByLabelText("期望标题最大长度"), { target: { value: "51" } });

    expect(screen.getByText("期望标题最大长度必须在 4 到 50 之间")).not.toBeNull();
    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);
    expect(saveExtensionSettings).not.toHaveBeenCalled();
  });

  it("disables page save when tool call limit is invalid", async () => {
    const saveExtensionSettings = vi.fn();
    const runtime = fakeRuntime({ saveExtensionSettings });

    renderWithNotifications(<ExtensionSettingsPage runtime={runtime} />);

    await screen.findByText("单轮工具调用上限");
    fireEvent.change(screen.getByLabelText("单轮最多工具调用"), { target: { value: "0" } });

    expect(screen.getByText("单轮最多工具调用必须在 1 到 500 之间")).not.toBeNull();
    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);
    expect(saveExtensionSettings).not.toHaveBeenCalled();
  });

  it("disables page save when duplicate guard threshold is invalid", async () => {
    const saveExtensionSettings = vi.fn();
    const runtime = fakeRuntime({ saveExtensionSettings });

    renderWithNotifications(<ExtensionSettingsPage runtime={runtime} />);

    await screen.findByText("重复工具调用保护");
    fireEvent.change(screen.getByLabelText("连续重复阈值"), { target: { value: "0" } });

    expect(screen.getByText("连续重复阈值必须在 1 到 20 之间")).not.toBeNull();
    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);
    expect(saveExtensionSettings).not.toHaveBeenCalled();
  });

  it("disables page save when context compression threshold order is invalid", async () => {
    const saveExtensionSettings = vi.fn();
    const runtime = fakeRuntime({ saveExtensionSettings });

    renderWithNotifications(<ExtensionSettingsPage runtime={runtime} />);

    await screen.findByText("上下文压缩");
    fireEvent.change(screen.getByLabelText("触发阈值"), { target: { value: "0.95" } });

    expect(screen.getByText("触发阈值必须小于紧急阈值")).not.toBeNull();
    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);
    expect(saveExtensionSettings).not.toHaveBeenCalled();
  });

  it("disables page save when context compression retain rounds are invalid", async () => {
    const saveExtensionSettings = vi.fn();
    const runtime = fakeRuntime({ saveExtensionSettings });

    renderWithNotifications(<ExtensionSettingsPage runtime={runtime} />);

    await screen.findByText("上下文压缩");
    fireEvent.change(screen.getByLabelText("保留轮数"), { target: { value: "21" } });

    expect(screen.getByText("保留轮数必须在 0 到 20 之间")).not.toBeNull();
    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);
    expect(saveExtensionSettings).not.toHaveBeenCalled();
  });

  it("disables page save when context compression window is invalid", async () => {
    const saveExtensionSettings = vi.fn();
    const runtime = fakeRuntime({ saveExtensionSettings });

    renderWithNotifications(<ExtensionSettingsPage runtime={runtime} />);

    await screen.findByText("上下文压缩");
    fireEvent.change(screen.getByLabelText("上下文窗口"), { target: { value: "999" } });

    expect(screen.getByText("上下文窗口必须在 1000 到 2000000 token 之间")).not.toBeNull();
    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);
    expect(saveExtensionSettings).not.toHaveBeenCalled();
  });
});

function renderWithNotifications(ui: ReactElement) {
  return render(<NotificationProvider>{ui}</NotificationProvider>);
}

function fakeRuntime({
  fastConfigured = true,
  saveExtensionSettings = vi.fn((payload: AgentRuntimeSettings) => Promise.resolve(payload)),
  settings = {},
}: {
  fastConfigured?: boolean;
  saveExtensionSettings?: (payload: AgentRuntimeSettings) => Promise<AgentRuntimeSettings>;
  settings?: Partial<AgentRuntimeSettings>;
} = {}): RuntimeBridge {
  const extensionSettings = mergeSettings(defaultExtensionSettings(), settings);
  return {
    settings: {
      getExtensionSettings: vi.fn().mockResolvedValue(extensionSettings),
      saveExtensionSettings,
      getModelDefaults: vi.fn().mockResolvedValue(modelDefaultsResponse(fastConfigured)),
    },
  } as unknown as RuntimeBridge;
}

function mergeSettings(
  base: AgentRuntimeSettings,
  patch: Partial<AgentRuntimeSettings>,
): AgentRuntimeSettings {
  return {
    auto_title: { ...base.auto_title, ...patch.auto_title },
    tool_call_limit: { ...base.tool_call_limit, ...patch.tool_call_limit },
    duplicate_tool_call_guard: {
      ...base.duplicate_tool_call_guard,
      ...patch.duplicate_tool_call_guard,
    },
    context_compression: { ...base.context_compression, ...patch.context_compression },
  };
}

function defaultExtensionSettings(): AgentRuntimeSettings {
  return {
    auto_title: {
      enabled: false,
      only_when_default_title: true,
      max_title_length: 20,
    },
    tool_call_limit: {
      enabled: true,
      max_tool_calls: 80,
      exit_behavior: "error",
    },
    duplicate_tool_call_guard: {
      enabled: true,
      max_repeats: 3,
    },
    context_compression: {
      enabled: false,
      context_window_tokens: 128000,
      trigger_fraction: 0.75,
      emergency_fraction: 0.9,
      retain_rounds: 2,
    },
  };
}

function modelDefaultsResponse(fastConfigured: boolean): ModelDefaultsResponse {
  return {
    defaults: {
      default_chat: {
        scope: "default_chat",
        configured: true,
        provider_id: "provider-main",
        provider_name: "默认供应商",
        model: "qwen-coder",
        provider_enabled: true,
        model_enabled: true,
        missing_reason: null,
      },
      fast: {
        scope: "fast",
        configured: fastConfigured,
        provider_id: fastConfigured ? "provider-fast" : null,
        provider_name: fastConfigured ? "快速供应商" : null,
        model: fastConfigured ? "fast-title" : null,
        provider_enabled: fastConfigured ? true : null,
        model_enabled: fastConfigured ? true : null,
        missing_reason: fastConfigured ? null : "not_configured",
      },
    },
  };
}
