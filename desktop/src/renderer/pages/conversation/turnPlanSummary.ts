import type { ConversationMessage } from "@/renderer/stores/conversationStore";

export type PlanStatus = "pending" | "in_progress" | "completed" | "failed";

export interface TurnPlanEntry {
  content: string;
  status: PlanStatus;
}

export interface TurnPlanSummary {
  activeEntry: TurnPlanEntry | null;
  activeIndex: number;
  completedCount: number;
  entries: TurnPlanEntry[];
  explanation: string | null;
  failedCount: number;
  totalCount: number;
}

export function buildActiveTurnPlanSummary(messages: ConversationMessage[]): TurnPlanSummary | null {
  const lastUserIndex = messages.findLastIndex((message) => message.kind === "user");
  const turnMessages = messages.slice(lastUserIndex + 1);
  for (let index = turnMessages.length - 1; index >= 0; index -= 1) {
    const message = turnMessages[index];
    if (message.kind !== "plan" || message.status === "failed") {
      continue;
    }
    const summary = planSummaryFromMessage(message);
    if (summary) {
      return summary;
    }
  }
  return null;
}

export function planSummaryFromMessage(message: ConversationMessage): TurnPlanSummary | null {
  const payload = message.payload;
  const directUiPayload = asRecord(payload.ui_payload) ?? asRecord(payload.uiPayload);
  const result = asRecord(payload.result);
  const resultUiPayload = asRecord(result?.ui_payload) ?? asRecord(result?.uiPayload);
  const nestedUiPayload = asRecord(directUiPayload?.ui_payload) ?? asRecord(resultUiPayload?.ui_payload);
  const outputData = asRecord(payload.output_data);
  const outputResult = asRecord(outputData?.result);
  const call = asRecord(payload.call);
  const callArguments = parseMaybeJson(call?.arguments);
  const sources = [
    nestedUiPayload,
    directUiPayload,
    resultUiPayload,
    outputResult,
    asRecord(result?.result),
    asRecord(payload),
    callArguments,
  ].filter((source): source is Record<string, unknown> => Boolean(source));

  for (const source of sources) {
    const entries = entriesFromSource(source);
    if (!entries.length) {
      continue;
    }
    const completedCount = entries.filter((entry) => entry.status === "completed").length;
    const failedCount = entries.filter((entry) => entry.status === "failed").length;
    const activeIndex = activePlanEntryIndex(entries);
    return {
      activeEntry: entries[activeIndex] ?? null,
      activeIndex,
      completedCount,
      entries,
      explanation: stringValue(source.explanation),
      failedCount,
      totalCount: entries.length,
    };
  }

  return null;
}

export function activePlanEntryIndex(entries: TurnPlanEntry[]): number {
  if (!entries.length) {
    return -1;
  }
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.status !== "pending") {
      return index;
    }
  }
  return 0;
}

function entriesFromSource(source: Record<string, unknown>): TurnPlanEntry[] {
  const nested = asRecord(source.ui_payload) ?? asRecord(source.uiPayload);
  const rawEntries = Array.isArray(source.entries)
    ? source.entries
    : Array.isArray(source.plan)
      ? source.plan
      : nested
        ? entriesFromSource(nested)
        : [];
  return rawEntries.map(normalizeEntry).filter((entry): entry is TurnPlanEntry => Boolean(entry));
}

function normalizeEntry(value: unknown): TurnPlanEntry | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const content = stringValue(record.content) ?? stringValue(record.step);
  if (!content) {
    return null;
  }
  return {
    content,
    status: normalizeStatus(record.status),
  };
}

function normalizeStatus(value: unknown): PlanStatus {
  if (value === "completed" || value === "in_progress" || value === "pending" || value === "failed") {
    return value;
  }
  return "pending";
}

function parseMaybeJson(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
