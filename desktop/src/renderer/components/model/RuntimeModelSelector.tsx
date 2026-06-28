import type { ModelLoadState, RuntimeModelOption, RuntimeSelectedModel } from "./useRuntimeModelSelection";
import { SearchableModelDropdown } from "./SearchableModelDropdown";
import styles from "./RuntimeModelSelector.module.css";

export interface RuntimeModelSelectorProps {
  model: RuntimeSelectedModel | null;
  modelOptions: RuntimeModelOption[];
  modelLoadState: ModelLoadState;
  modelError: string | null;
  disabled?: boolean;
  placement?: "top" | "bottom";
  onModelChange: (model: RuntimeSelectedModel) => void;
  onOpenModelSettings?: () => void;
}

export function RuntimeModelSelector({
  model,
  modelOptions,
  modelLoadState,
  modelError,
  disabled = false,
  placement = "bottom",
  onModelChange,
  onOpenModelSettings,
}: RuntimeModelSelectorProps) {
  const modelHint = getModelHint(model, modelOptions, modelLoadState, modelError);
  const showSettingsAction = Boolean(onOpenModelSettings) && (modelLoadState === "error" || (!model && !modelOptions.length));
  const disabledButton = disabled || !modelOptions.length;
  const placeholder = modelLoadState === "loading" ? "读取模型" : "暂无模型";

  return (
    <div className={styles.modelCluster} aria-label="运行模型">
      <SearchableModelDropdown
        value={model}
        options={modelOptions}
        variant="pill"
        placement={placement}
        placeholder={placeholder}
        disabled={disabledButton}
        title={modelHint ?? "选择模型"}
        menuLabel="模型"
        emptyText="没有匹配模型"
        searchPlaceholder="搜索供应商或模型"
        onChange={(nextModel) => {
          if (nextModel) {
            onModelChange(nextModel);
          }
        }}
      />

      {showSettingsAction ? (
        <button className={styles.settingsButton} type="button" disabled={disabled} onClick={onOpenModelSettings}>
          打开模型设置
        </button>
      ) : null}
    </div>
  );
}

function getModelHint(
  model: RuntimeSelectedModel | null,
  modelOptions: RuntimeModelOption[],
  modelLoadState: ModelLoadState,
  modelError: string | null,
): string | null {
  if (modelLoadState === "loading") {
    return "正在读取模型列表";
  }
  if (modelError) {
    return modelError;
  }
  if (!modelOptions.length) {
    return "暂无可用模型，请先到供应商配置中刷新并启用模型";
  }
  if (!model) {
    return "请先到模型配置中设置默认对话模型，或在此选择模型";
  }
  if (!modelOptions.some((option) => option.providerId === model.providerId && option.model === model.model)) {
    return "当前模型不在已启用模型列表中，请到供应商配置中确认";
  }
  return null;
}
