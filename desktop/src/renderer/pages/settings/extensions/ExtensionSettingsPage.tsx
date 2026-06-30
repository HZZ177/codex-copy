import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { useNotifications } from "@/renderer/providers/NotificationProvider";
import { runtimeBridge, type RuntimeBridge } from "@/runtime";
import type {
  AgentRuntimeSettings,
  AutoTitleRuntimeSettings,
  ContextCompressionRuntimeSettings,
  DuplicateToolCallGuardRuntimeSettings,
  ModelDefaultsResponse,
  ToolCallLimitRuntimeSettings,
} from "@/types/protocol";

import styles from "./ExtensionSettingsPage.module.css";

export interface ExtensionSettingsPageProps {
  runtime?: RuntimeBridge;
  onOpenModelConfig?: () => void;
}

type ExtensionDrafts = {
  autoTitle: AutoTitleRuntimeSettings;
  toolLimit: ToolCallLimitRuntimeSettings;
  duplicateGuard: DuplicateToolCallGuardRuntimeSettings;
  compression: ContextCompressionRuntimeSettings;
};

export function ExtensionSettingsPage({
  runtime = runtimeBridge,
  onOpenModelConfig,
}: ExtensionSettingsPageProps) {
  const notifications = useNotifications();
  const [drafts, setDrafts] = useState<ExtensionDrafts | null>(null);
  const [defaults, setDefaults] = useState<ModelDefaultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([runtime.settings.getExtensionSettings(), runtime.settings.getModelDefaults()])
      .then(([nextSettings, nextDefaults]) => {
        if (!active) {
          return;
        }
        setDrafts(draftsFromSettings(nextSettings));
        setDefaults(nextDefaults);
      })
      .catch((reason: unknown) => {
        if (active) {
          notifications.error(errorMessage(reason));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [notifications, runtime]);

  const fastConfigured = Boolean(defaults?.defaults.fast.configured);
  const titleDraft = drafts?.autoTitle ?? null;
  const toolDraft = drafts?.toolLimit ?? null;
  const duplicateGuardDraft = drafts?.duplicateGuard ?? null;
  const compressionDraft = drafts?.compression ?? null;
  const titleDependencyMissing = Boolean(titleDraft?.enabled && !fastConfigured);
  const compressionDependencyMissing = Boolean(compressionDraft?.enabled && !fastConfigured);
  const titleLengthInvalid = titleDraft ? titleDraft.max_title_length < 4 || titleDraft.max_title_length > 120 : false;
  const toolLimitInvalid = toolDraft ? toolDraft.max_tool_calls < 1 || toolDraft.max_tool_calls > 500 : false;
  const duplicateGuardInvalid = duplicateGuardDraft
    ? duplicateGuardDraft.max_repeats < 1 || duplicateGuardDraft.max_repeats > 20
    : false;
  const compressionTriggerInvalid = compressionDraft
    ? compressionDraft.trigger_fraction <= 0 || compressionDraft.trigger_fraction >= 1
    : false;
  const compressionEmergencyInvalid = compressionDraft
    ? compressionDraft.emergency_fraction <= 0 || compressionDraft.emergency_fraction > 1
    : false;
  const compressionOrderInvalid = compressionDraft
    ? compressionDraft.trigger_fraction >= compressionDraft.emergency_fraction
    : false;
  const compressionRetainInvalid = compressionDraft
    ? compressionDraft.retain_rounds < 0 || compressionDraft.retain_rounds > 20
    : false;
  const compressionWindowInvalid = compressionDraft
    ? compressionDraft.context_window_tokens < 1000 || compressionDraft.context_window_tokens > 2_000_000
    : false;
  const canSave =
    Boolean(drafts) &&
    !saving &&
    !titleDependencyMissing &&
    !compressionDependencyMissing &&
    !titleLengthInvalid &&
    !toolLimitInvalid &&
    !duplicateGuardInvalid &&
    !compressionTriggerInvalid &&
    !compressionEmergencyInvalid &&
    !compressionOrderInvalid &&
    !compressionRetainInvalid &&
    !compressionWindowInvalid;

  const updateDrafts = (updater: (current: ExtensionDrafts) => ExtensionDrafts) => {
    setDrafts((current) => (current ? updater(current) : current));
  };

  const updateTitleDraft = (patch: Partial<AutoTitleRuntimeSettings>) => {
    updateDrafts((current) => ({ ...current, autoTitle: { ...current.autoTitle, ...patch } }));
  };

  const updateToolDraft = (patch: Partial<ToolCallLimitRuntimeSettings>) => {
    updateDrafts((current) => ({ ...current, toolLimit: { ...current.toolLimit, ...patch } }));
  };

  const updateDuplicateGuardDraft = (patch: Partial<DuplicateToolCallGuardRuntimeSettings>) => {
    updateDrafts((current) => ({
      ...current,
      duplicateGuard: { ...current.duplicateGuard, ...patch },
    }));
  };

  const updateCompressionDraft = (patch: Partial<ContextCompressionRuntimeSettings>) => {
    updateDrafts((current) => ({ ...current, compression: { ...current.compression, ...patch } }));
  };

  const saveExtensionPage = async () => {
    if (!drafts || !canSave) {
      return;
    }
    setSaving(true);
    try {
      const nextSettings = await runtime.settings.saveExtensionSettings(settingsFromDrafts(drafts));
      setDrafts(draftsFromSettings(nextSettings));
      notifications.success("扩展功能配置已保存");
    } catch (reason) {
      notifications.error(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page} data-testid="extension-settings-page">
      <header className={styles.header}>
        <h1>扩展功能</h1>
        <p>配置基础增强能力</p>
      </header>

      {loading ? <div className={styles.muted}>正在读取扩展功能配置</div> : null}

      {!loading && drafts && titleDraft && toolDraft && duplicateGuardDraft && compressionDraft ? (
        <section className={styles.settingsGroup} aria-labelledby="extension-feature-title">
          <div className={styles.groupHeader}>
            <h2 id="extension-feature-title">功能模块</h2>
          </div>

          <div className={styles.settingsPanel}>
            <SettingRow
              title="标题生成"
              description="自动为新会话生成标题"
              control={
                <ToggleSwitch
                  checked={titleDraft.enabled}
                  label="启用标题生成"
                  onChange={(enabled) => updateTitleDraft({ enabled })}
                />
              }
            />
            {titleDependencyMissing ? (
              <DependencyWarning message="快速模型未配置，标题生成不可用" onOpenModelConfig={onOpenModelConfig} />
            ) : null}
            <SettingRow
              title="最大标题长度"
              description="生成标题的最大字符数"
              control={
                <NumberInput
                  label="最大标题长度"
                  max={120}
                  min={4}
                  onChange={(max_title_length) => updateTitleDraft({ max_title_length })}
                  value={titleDraft.max_title_length}
                />
              }
            />
            {titleLengthInvalid ? (
              <div className={styles.fieldError}>最大标题长度必须在 4 到 120 之间</div>
            ) : null}
          </div>

          <div className={styles.settingsPanel}>
            <SettingRow
              title="单轮工具调用上限"
              description="限制单轮对话中的真实工具调用次数"
              control={
                <ToggleSwitch
                  checked={toolDraft.enabled}
                  label="启用工具上限"
                  onChange={(enabled) => updateToolDraft({ enabled })}
                />
              }
            />
            <SettingRow
              title="最多工具调用"
              description="超过阈值后终止当前轮次"
              control={
                <NumberInput
                  label="单轮最多工具调用"
                  max={500}
                  min={1}
                  onChange={(max_tool_calls) => updateToolDraft({ max_tool_calls })}
                  value={toolDraft.max_tool_calls}
                />
              }
            />
            {toolLimitInvalid ? (
              <div className={styles.fieldError}>单轮最多工具调用必须在 1 到 500 之间</div>
            ) : null}
          </div>

          <div className={styles.settingsPanel}>
            <SettingRow
              title="重复工具调用保护"
              description="连续相同工具和参数超过阈值后终止本轮对话"
              control={
                <ToggleSwitch
                  checked={duplicateGuardDraft.enabled}
                  label="启用重复保护"
                  onChange={(enabled) => updateDuplicateGuardDraft({ enabled })}
                />
              }
            />
            <SettingRow
              title="连续重复阈值"
              description="允许连续重复相同工具调用的次数"
              control={
                <NumberInput
                  label="连续重复阈值"
                  max={20}
                  min={1}
                  onChange={(max_repeats) => updateDuplicateGuardDraft({ max_repeats })}
                  value={duplicateGuardDraft.max_repeats}
                />
              }
            />
            {duplicateGuardInvalid ? (
              <div className={styles.fieldError}>连续重复阈值必须在 1 到 20 之间</div>
            ) : null}
          </div>

          <div className={styles.settingsPanel}>
            <SettingRow
              title="上下文压缩"
              description="在上下文接近窗口上限时压缩历史内容"
              control={
                <ToggleSwitch
                  checked={compressionDraft.enabled}
                  label="启用上下文压缩"
                  onChange={(enabled) => updateCompressionDraft({ enabled })}
                />
              }
            />
            {compressionDependencyMissing ? (
              <DependencyWarning message="快速模型未配置，上下文压缩不可用" onOpenModelConfig={onOpenModelConfig} />
            ) : null}
            <SettingRow
              title="上下文窗口"
              description="用于估算压缩触发点的上下文窗口大小"
              control={
                <NumberInput
                  label="上下文窗口"
                  max={2000000}
                  min={1000}
                  onChange={(context_window_tokens) => updateCompressionDraft({ context_window_tokens })}
                  step={1000}
                  value={compressionDraft.context_window_tokens}
                />
              }
            />
            <SettingRow
              title="触发阈值"
              description="达到该窗口比例后触发压缩"
              control={
                <NumberInput
                  label="触发阈值"
                  max={0.99}
                  min={0.01}
                  onChange={(trigger_fraction) => updateCompressionDraft({ trigger_fraction })}
                  step={0.01}
                  value={compressionDraft.trigger_fraction}
                />
              }
            />
            <SettingRow
              title="紧急阈值"
              description="达到该窗口比例后优先压缩"
              control={
                <NumberInput
                  label="紧急阈值"
                  max={1}
                  min={0.01}
                  onChange={(emergency_fraction) => updateCompressionDraft({ emergency_fraction })}
                  step={0.01}
                  value={compressionDraft.emergency_fraction}
                />
              }
            />
            <SettingRow
              title="保留轮数"
              description="压缩时保留最近完整轮次"
              control={
                <NumberInput
                  label="保留轮数"
                  max={20}
                  min={0}
                  onChange={(retain_rounds) => updateCompressionDraft({ retain_rounds })}
                  value={compressionDraft.retain_rounds}
                />
              }
            />
            {compressionTriggerInvalid ? (
              <div className={styles.fieldError}>触发阈值必须大于 0 且小于 1</div>
            ) : null}
            {compressionEmergencyInvalid ? (
              <div className={styles.fieldError}>紧急阈值必须大于 0 且小于等于 1</div>
            ) : null}
            {compressionOrderInvalid ? (
              <div className={styles.fieldError}>触发阈值必须小于紧急阈值</div>
            ) : null}
            {compressionRetainInvalid ? (
              <div className={styles.fieldError}>保留轮数必须在 0 到 20 之间</div>
            ) : null}
            {compressionWindowInvalid ? (
              <div className={styles.fieldError}>上下文窗口必须在 1000 到 2000000 token 之间</div>
            ) : null}
          </div>

          <div className={styles.actions}>
            <button disabled={!canSave} onClick={() => void saveExtensionPage()} type="button">
              {saving ? "保存中" : "保存"}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function SettingRow({
  control,
  description,
  title,
}: {
  control: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingText}>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className={styles.settingControl}>{control}</div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.toggle}>
      <input
        aria-label={label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        role="switch"
        type="checkbox"
      />
      <span aria-hidden="true" className={styles.toggleTrack}>
        <span className={styles.toggleThumb} />
      </span>
    </label>
  );
}

function NumberInput({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <input
      aria-label={label}
      className={styles.numberInput}
      max={max}
      min={min}
      onChange={(event) => onChange(Number(event.target.value))}
      step={step}
      type="number"
      value={value}
    />
  );
}

function DependencyWarning({
  message,
  onOpenModelConfig,
}: {
  message: string;
  onOpenModelConfig?: () => void;
}) {
  return (
    <div className={styles.warning} role="alert">
      <span>{message}</span>
      {onOpenModelConfig ? (
        <button type="button" onClick={onOpenModelConfig}>
          配置模型
        </button>
      ) : null}
    </div>
  );
}

function draftsFromSettings(settings: AgentRuntimeSettings): ExtensionDrafts {
  return {
    autoTitle: { ...settings.auto_title, only_when_default_title: true },
    toolLimit: settings.tool_call_limit,
    duplicateGuard: settings.duplicate_tool_call_guard,
    compression: settings.context_compression,
  };
}

function settingsFromDrafts(drafts: ExtensionDrafts): AgentRuntimeSettings {
  return {
    auto_title: { ...drafts.autoTitle, only_when_default_title: true },
    tool_call_limit: drafts.toolLimit,
    duplicate_tool_call_guard: drafts.duplicateGuard,
    context_compression: drafts.compression,
  };
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (reason && typeof reason === "object" && typeof (reason as { message?: unknown }).message === "string") {
    return (reason as { message: string }).message;
  }
  return "读取扩展功能配置失败";
}
