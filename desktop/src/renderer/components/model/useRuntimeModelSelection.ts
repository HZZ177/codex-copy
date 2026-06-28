import { useEffect, useMemo, useState } from "react";

import { runtimeBridge, type ModelProvider, type RuntimeBridge } from "@/runtime";

export type ModelLoadState = "idle" | "loading" | "ready" | "error";

export interface RuntimeSelectedModel {
  providerId: string;
  model: string;
}

export interface RuntimeModelOption {
  providerId: string;
  providerName: string;
  model: string;
}

export interface RuntimeModelSelection {
  selectedModel: RuntimeSelectedModel | null;
  modelOptions: RuntimeModelOption[];
  modelLoadState: ModelLoadState;
  modelError: string | null;
  setSelectedModel: (selection: RuntimeSelectedModel | null) => void;
}

export interface RuntimeModelSelectionOptions {
  enabled?: boolean;
}

export function useRuntimeModelSelection(
  runtime: RuntimeBridge = runtimeBridge,
  initialModel: RuntimeSelectedModel | null = null,
  options: RuntimeModelSelectionOptions = {},
): RuntimeModelSelection {
  const enabled = options.enabled ?? true;
  const [selectedModel, setSelectedModel] = useState<RuntimeSelectedModel | null>(() =>
    normalizeSelection(initialModel),
  );
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [modelLoadState, setModelLoadState] = useState<ModelLoadState>("idle");
  const [modelError, setModelError] = useState<string | null>(null);

  useEffect(() => {
    const selection = normalizeSelection(initialModel);
    if (selection) {
      setSelectedModel(selection);
    }
  }, [initialModel?.providerId, initialModel?.model]);

  useEffect(() => {
    if (!enabled) {
      setModelLoadState("idle");
      setModelError(null);
      setProviders([]);
      return;
    }

    let active = true;
    setModelLoadState("loading");
    setModelError(null);

    const loadModels = async () => {
      const [defaultsResult, providersResult] = await Promise.allSettled([
        runtime.settings.getModelDefaults(),
        runtime.models.listProviders(),
      ]);
      if (!active) {
        return;
      }

      let nextError: string | null = null;
      if (providersResult.status === "fulfilled") {
        setProviders(providersResult.value);
      } else {
        nextError = `读取模型列表失败：${errorMessage(providersResult.reason)}`;
        setProviders([]);
      }

      if (defaultsResult.status === "fulfilled") {
        const defaultChat = defaultsResult.value.defaults.default_chat;
        if (defaultChat?.configured && defaultChat.provider_id && defaultChat.model) {
          setSelectedModel((current) => current ?? { providerId: defaultChat.provider_id!, model: defaultChat.model! });
        }
      } else {
        nextError = `读取默认模型失败：${errorMessage(defaultsResult.reason)}`;
      }

      setModelError(nextError);
      setModelLoadState(nextError ? "error" : "ready");
    };

    void loadModels();
    return () => {
      active = false;
    };
  }, [enabled, runtime]);

  const modelOptions = useMemo(() => buildModelOptions(providers, selectedModel), [providers, selectedModel]);

  return {
    selectedModel,
    modelOptions,
    modelLoadState,
    modelError,
    setSelectedModel,
  };
}

function buildModelOptions(providers: ModelProvider[], selectedModel: RuntimeSelectedModel | null): RuntimeModelOption[] {
  const options: RuntimeModelOption[] = [];
  const seen = new Set<string>();
  for (const provider of providers) {
    if (!provider.enabled) {
      continue;
    }
    for (const model of provider.models) {
      const modelId = model.trim();
      if (!modelId || provider.model_enabled[modelId] === false) {
        continue;
      }
      const key = optionKey(provider.id, modelId);
      seen.add(key);
      options.push({ providerId: provider.id, providerName: provider.name, model: modelId });
    }
  }
  if (selectedModel) {
    const key = optionKey(selectedModel.providerId, selectedModel.model);
    if (!seen.has(key)) {
      options.push({
        providerId: selectedModel.providerId,
        providerName: selectedModel.providerId,
        model: selectedModel.model,
      });
    }
  }
  return options;
}

function normalizeSelection(selection: RuntimeSelectedModel | null | undefined): RuntimeSelectedModel | null {
  const providerId = selection?.providerId.trim() ?? "";
  const model = selection?.model.trim() ?? "";
  if (!providerId || !model) {
    return null;
  }
  return { providerId, model };
}

function optionKey(providerId: string, model: string): string {
  return `${providerId}\u0000${model}`;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (reason && typeof reason === "object" && typeof (reason as { message?: unknown }).message === "string") {
    return (reason as { message: string }).message;
  }
  return "模型读取失败";
}
