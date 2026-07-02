import { type FormEvent, useMemo, useState } from "react";

import type { ModelProvider, RuntimeBridge } from "@/runtime";
import { AppDialog, DialogButton } from "@/renderer/components/dialog";

import styles from "./ProviderModal.module.css";

export type ProviderModalMode = "create" | "edit";

export interface ProviderModalProps {
  mode: ProviderModalMode;
  provider?: ModelProvider;
  runtime: RuntimeBridge;
  onClose: () => void;
  onSaved: (provider: ModelProvider) => void;
  onDeleted: (providerId: string) => void;
}

export function ProviderModal({
  mode,
  provider,
  runtime,
  onClose,
  onDeleted,
  onSaved,
}: ProviderModalProps) {
  const [name, setName] = useState(provider?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "create" ? "新增供应商" : "编辑供应商";
  const canDelete = mode === "edit" && provider;
  const keyHint = useMemo(() => {
    if (mode === "create") {
      return "用于调用模型服务，保存后只显示掩码";
    }
    if (provider?.api_key_set) {
      return `已保存 ${provider.api_key_preview ?? "密钥"}，留空表示不修改`;
    }
    return "当前未保存密钥，留空表示继续不设置";
  }, [mode, provider]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const validationError = validateProviderForm(name, baseUrl);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const cleanedName = name.trim();
      const cleanedBaseUrl = normalizeBaseUrl(baseUrl);
      if (mode === "create") {
        const saved = await runtime.models.createProvider({
          name: cleanedName,
          base_url: cleanedBaseUrl,
          api_key: apiKey.trim() || undefined,
          enabled,
        });
        onSaved(saved);
        return;
      }
      if (!provider) {
        throw new Error("供应商不存在");
      }
      const saved = await runtime.models.updateProvider(provider.id, {
        name: cleanedName,
        base_url: cleanedBaseUrl,
        enabled,
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      onSaved(saved);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  async function deleteProvider() {
    if (!provider) {
      return;
    }
    setError(null);
    setDeleting(true);
    try {
      await runtime.models.deleteProvider(provider.id);
      onDeleted(provider.id);
    } catch (reason) {
      setError(errorMessage(reason));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppDialog
      title={title}
      description="仅支持 OpenAI 兼容供应商"
      size="form"
      closeLabel="关闭"
      closeOnOverlayClick={false}
      onClose={onClose}
    >
      <form aria-label={title} className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          <span>名称</span>
          <input
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder="例如 默认模型服务"
            value={name}
          />
        </label>

        <label className={styles.field}>
          <span>接口地址</span>
          <input
            aria-label="接口地址"
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.example.com/v1"
            value={baseUrl}
          />
        </label>

        <label className={styles.field}>
          <span>接口密钥</span>
          <input
            aria-label="接口密钥"
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={mode === "create" ? "sk-..." : "留空则不修改"}
            type="password"
            value={apiKey}
          />
          <small>{keyHint}</small>
        </label>

        <label className={styles.toggleRow}>
          <span>
            <strong>启用供应商</strong>
            <small>停用后不会作为可选模型来源</small>
          </span>
          <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
        </label>

        {error ? <div className={styles.error} role="alert">{error}</div> : null}

        {confirmDelete ? (
          <div className={styles.confirmBox}>
            <span>确认删除该供应商？已刷新模型列表会一并移除。</span>
            <div>
              <button disabled={deleting} onClick={() => void deleteProvider()} type="button">
                {deleting ? "删除中" : "确认删除"}
              </button>
              <button disabled={deleting} onClick={() => setConfirmDelete(false)} type="button">
                取消
              </button>
            </div>
          </div>
        ) : null}

        <footer className={styles.footer}>
          {canDelete ? (
            <DialogButton
              tone="danger"
              disabled={saving || deleting}
              onClick={() => setConfirmDelete(true)}
              type="button"
            >
              删除供应商
            </DialogButton>
          ) : null}
          <span className={styles.spacer} />
          <DialogButton disabled={saving || deleting} onClick={onClose} type="button">
            取消
          </DialogButton>
          <DialogButton tone="primary" disabled={saving || deleting} type="submit">
            {saving ? "保存中" : "保存"}
          </DialogButton>
        </footer>
      </form>
    </AppDialog>
  );
}

export function validateProviderForm(name: string, baseUrl: string): string | null {
  if (!name.trim()) {
    return "请填写供应商名称";
  }
  if (!baseUrl.trim()) {
    return "请填写接口地址";
  }
  try {
    const parsed = new URL(baseUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "接口地址必须是 http(s) 地址";
    }
  } catch {
    return "接口地址必须是有效地址";
  }
  return null;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (reason && typeof reason === "object" && typeof (reason as { message?: unknown }).message === "string") {
    return (reason as { message: string }).message;
  }
  return "供应商保存失败";
}
