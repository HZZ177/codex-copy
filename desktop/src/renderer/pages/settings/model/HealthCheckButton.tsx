import { Activity, AlertCircle, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { ModelHealth, RuntimeBridge } from "@/runtime";
import { useNotifications } from "@/renderer/providers/NotificationProvider";

import styles from "./HealthCheckButton.module.css";

export interface HealthCheckButtonProps {
  model: string;
  providerId: string;
  runtime: RuntimeBridge;
}

export function HealthCheckButton({
  model,
  providerId,
  runtime,
}: HealthCheckButtonProps) {
  const notifications = useNotifications();
  const [checking, setChecking] = useState(false);
  const [displayed, setDisplayed] = useState<ModelHealth | undefined>();
  const label = useMemo(() => healthLabel(displayed), [displayed]);

  async function checkHealth() {
    setChecking(true);
    try {
      const response = await runtime.models.checkModelHealth(providerId, model);
      setDisplayed(response.health);
    } catch (reason) {
      notifications.error(errorMessage(reason));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className={styles.root}>
      <button
        aria-label={`测试 ${model} 连接状态`}
        className={styles.button}
        data-status={displayed?.status ?? "unknown"}
        disabled={checking}
        onClick={() => void checkHealth()}
        title={displayed?.checked_at ? `本次测试 ${formatCheckedAt(displayed.checked_at)}` : undefined}
        type="button"
      >
        {statusIcon(displayed?.status, checking)}
        <span>{checking ? "测试中" : label}</span>
      </button>
      {displayed?.status === "unhealthy" && displayed.error ? (
        <span className={styles.healthError}>{displayed.error}</span>
      ) : null}
    </div>
  );
}

function statusIcon(status: ModelHealth["status"] | undefined, checking: boolean) {
  if (checking) {
    return <Activity className={styles.spinning} size={13} />;
  }
  if (status === "healthy") {
    return <CheckCircle2 size={13} />;
  }
  if (status === "unhealthy") {
    return <AlertCircle size={13} />;
  }
  return <Activity size={13} />;
}

function healthLabel(health?: ModelHealth): string {
  if (!health) {
    return "测试";
  }
  const latency = Number.isFinite(health.latency_ms) ? ` ${health.latency_ms}ms` : "";
  return health.status === "healthy" ? `可用${latency}` : `异常${latency}`;
}

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (reason && typeof reason === "object" && typeof (reason as { message?: unknown }).message === "string") {
    return (reason as { message: string }).message;
  }
  return "模型测试失败";
}
