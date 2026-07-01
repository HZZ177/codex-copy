import type { ConversationMessage } from "@/renderer/stores/conversationStore";

export type TurnFileChangeKind = "created" | "edited";

export interface TurnFileChangeItem {
  additions: number;
  deletions: number;
  diff: string;
  kind: TurnFileChangeKind;
  path: string;
  sourceMessage?: ConversationMessage;
  sourceMessages: ConversationMessage[];
}

export interface TurnFileChangeSummary {
  additions: number;
  createdCount: number;
  deletions: number;
  editedCount: number;
  files: TurnFileChangeItem[];
}

type FileChangeOperation = "add" | "update" | "delete" | "append" | "write" | "unknown";

const EMPTY_SUMMARY: TurnFileChangeSummary = {
  additions: 0,
  createdCount: 0,
  deletions: 0,
  editedCount: 0,
  files: [],
};

export function buildActiveTurnFileChangeSummary(messages: ConversationMessage[]): TurnFileChangeSummary {
  const lastUserIndex = messages.findLastIndex((message) => message.kind === "user");
  return buildTurnFileChangeSummary(messages.slice(lastUserIndex + 1));
}

export function buildTurnFileChangeSummary(messages: ConversationMessage[]): TurnFileChangeSummary {
  const filesByKey = new Map<string, TurnFileChangeItem>();

  messages.forEach((message, messageIndex) => {
    if (!isFileChangeSummarySource(message) || isFailedFileChangeMessage(message)) {
      return;
    }
    fileChangeItemsFromMessage(message, messageIndex).forEach((file) => {
      filesByKey.set(file.path, mergeTurnFileChangeItem(filesByKey.get(file.path), file));
    });
  });

  if (!filesByKey.size) {
    return EMPTY_SUMMARY;
  }

  const files = [...filesByKey.values()].sort((left, right) => left.path.localeCompare(right.path));
  return {
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    createdCount: files.filter((file) => file.kind === "created").length,
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    editedCount: files.filter((file) => file.kind === "edited").length,
    files,
  };
}

function isFileChangeSummarySource(message: ConversationMessage): boolean {
  if (message.kind === "file_change") {
    return true;
  }
  if (message.kind !== "tool") {
    return false;
  }
  return operationFromToolName(toolNameFromMessage(message)) !== "unknown";
}

function isFailedFileChangeMessage(message: ConversationMessage): boolean {
  const result = asRecord(message.payload.result);
  const status = stringValue(result?.status ?? message.payload.status).toLowerCase();
  return (
    message.status === "failed" ||
    status === "error" ||
    status === "failed" ||
    Boolean(result?.error) ||
    Boolean(message.payload.error)
  );
}

function fileChangeItemsFromMessage(message: ConversationMessage, messageIndex: number): TurnFileChangeItem[] {
  const result = asRecord(message.payload.result);
  const toolOperation = operationFromToolName(toolNameFromMessage(message));
  const forcedOperation = toolOperation !== "unknown" ? toolOperation : null;
  const fallbackOperation = forcedOperation ?? operationFromRecord(result ?? message.payload, "unknown");
  const files = new Map<string, TurnFileChangeItem>();

  fileChangeItemsFromPayload(message.payload, messageIndex, fallbackOperation, forcedOperation, message).forEach((file) => {
    files.set(`${file.kind}:${file.path}`, file);
  });
  if (result) {
    fileChangeItemsFromPayload(
      result,
      messageIndex,
      operationFromRecord(result, fallbackOperation),
      forcedOperation,
      message,
    ).forEach((file) => {
      files.set(`${file.kind}:${file.path}`, file);
    });
  }

  if (!files.size) {
    const path = toolTarget(toolArgsFromMessage(message), message.payload, messageIndex);
    const kind = summaryKindForOperation(fallbackOperation);
    if (kind) {
      files.set(`${kind}:${path}`, {
        additions: 0,
        deletions: 0,
        diff: "",
        kind,
        path,
        sourceMessage: message,
        sourceMessages: [message],
      });
    }
  }

  return [...files.values()];
}

function fileChangeItemsFromPayload(
  payload: Record<string, unknown>,
  messageIndex: number,
  fallbackOperation: FileChangeOperation,
  forcedOperation: FileChangeOperation | null,
  sourceMessage: ConversationMessage,
): TurnFileChangeItem[] {
  const files = new Map<string, TurnFileChangeItem>();
  const parentOperation = forcedOperation ?? operationFromRecord(payload, fallbackOperation);
  const directPath = stringValue(payload.path);
  if (directPath) {
    const direct = fileChangeItemFromRecord(payload, directPath, parentOperation, forcedOperation, sourceMessage);
    if (direct) {
      files.set(`${direct.kind}:${direct.path}`, direct);
    }
  }

  fileRecordsFromPayload(payload).forEach((record, fileIndex) => {
    const path = stringValue(record?.path) || `file-${messageIndex}-${fileIndex}`;
    const item = fileChangeItemFromRecord(record ?? {}, path, parentOperation, forcedOperation, sourceMessage);
    if (item) {
      files.set(`${item.kind}:${item.path}`, item);
    }
  });

  return [...files.values()];
}

function fileRecordsFromPayload(payload: Record<string, unknown>): Array<Record<string, unknown> | null> {
  const uiPayload = asRecord(payload.ui_payload) ?? asRecord(payload.uiPayload);
  return [
    ...arrayRecords(payload.files),
    ...arrayRecords(payload.changes),
    ...arrayRecords(uiPayload?.files),
    ...arrayRecords(uiPayload?.changes),
  ];
}

function fileChangeItemFromRecord(
  record: Record<string, unknown>,
  path: string,
  fallbackOperation: FileChangeOperation,
  forcedOperation: FileChangeOperation | null,
  sourceMessage: ConversationMessage,
): TurnFileChangeItem | null {
  const operation = forcedOperation ?? operationFromRecord(record, fallbackOperation);
  const kind = summaryKindForOperation(operation);
  if (!kind) {
    return null;
  }
  const diff = stringValue(record.diff);
  return {
    additions: numberValue(record.additions) ?? numberValue(record.added_lines) ?? countDiff(diff, "+"),
    deletions:
      numberValue(record.deletions) ??
      numberValue(record.deleted_lines) ??
      numberValue(record.removed_lines) ??
      countDiff(diff, "-"),
    diff,
    kind,
    path,
    sourceMessage,
    sourceMessages: [sourceMessage],
  };
}

function mergeTurnFileChangeItem(
  existing: TurnFileChangeItem | undefined,
  next: TurnFileChangeItem,
): TurnFileChangeItem {
  if (!existing) {
    return next;
  }
  return {
    path: existing.path,
    kind: existing.kind === "created" || next.kind === "created" ? "created" : "edited",
    additions: existing.additions + next.additions,
    deletions: existing.deletions + next.deletions,
    diff: joinDiffs(existing.diff, next.diff),
    sourceMessage: next.sourceMessage ?? existing.sourceMessage,
    sourceMessages: appendUniqueMessages(existing.sourceMessages, next.sourceMessages),
  };
}

function joinDiffs(...diffs: string[]): string {
  return diffs.map((diff) => diff.trim()).filter(Boolean).join("\n");
}

function appendUniqueMessages(
  existing: ConversationMessage[],
  next: ConversationMessage[],
): ConversationMessage[] {
  const messages = [...existing];
  const keys = new Set(messages.map(messageIdentity));
  next.forEach((message) => {
    const key = messageIdentity(message);
    if (keys.has(key)) {
      return;
    }
    keys.add(key);
    messages.push(message);
  });
  return messages;
}

function messageIdentity(message: ConversationMessage): string {
  return message.id || message.itemId || `${message.kind}:${message.createdAt}`;
}

function summaryKindForOperation(operation: FileChangeOperation): TurnFileChangeKind | null {
  switch (operation) {
    case "add":
      return "created";
    case "append":
    case "update":
    case "write":
    case "unknown":
      return "edited";
    case "delete":
      return null;
  }
}

function operationFromToolName(toolName: string): FileChangeOperation {
  if (toolName === "create_file" || toolName === "write_file") {
    return "add";
  }
  if (toolName === "delete_file") {
    return "delete";
  }
  if (toolName === "apply_patch" || toolName === "edit_file") {
    return "update";
  }
  return "unknown";
}

function operationFromRecord(
  record: Record<string, unknown> | null,
  fallbackOperation: FileChangeOperation,
): FileChangeOperation {
  if (!record) {
    return fallbackOperation;
  }
  const explicit = normalizeOperation(
    record.operation ??
      record.action ??
      record.kind ??
      record.change_type ??
      record.changeType,
  );
  if (explicit !== "unknown") {
    return explicit;
  }
  if (record.created === true || record.is_new === true || record.isNew === true) {
    return "add";
  }
  return fallbackOperation;
}

function normalizeOperation(value: unknown): FileChangeOperation {
  if (typeof value !== "string") {
    return "unknown";
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["add", "create", "created", "new", "new_file", "insert", "write", "write_file", "overwrite"].includes(normalized)) {
    return "add";
  }
  if (["delete", "deleted", "remove", "removed"].includes(normalized)) {
    return "delete";
  }
  if (["append", "append_file"].includes(normalized)) {
    return "append";
  }
  if (["update", "edit", "modify", "modified", "patch", "apply_patch"].includes(normalized)) {
    return "update";
  }
  return "unknown";
}

function toolNameFromMessage(message: ConversationMessage): string {
  const call = asRecord(message.payload.call);
  return (
    stringValue(call?.name) ||
    stringValue(message.payload.tool) ||
    stringValue(message.payload.tool_name) ||
    stringValue(message.payload.toolName)
  );
}

function toolArgsFromMessage(message: ConversationMessage): Record<string, unknown> | null {
  const call = asRecord(message.payload.call);
  return asRecord(call?.arguments) ?? asRecord(message.payload.arguments) ?? asRecord(message.payload.params);
}

function toolTarget(args: Record<string, unknown> | null, payload: Record<string, unknown>, index: number): string {
  return (
    stringValue(args?.path) ||
    stringValue(args?.file) ||
    stringValue(payload.path) ||
    `file-${index}`
  );
}

function countDiff(value: string, prefix: "+" | "-"): number {
  if (!value) {
    return 0;
  }
  const ignored = prefix === "+" ? "+++" : "---";
  return value.split("\n").filter((line) => line.startsWith(prefix) && !line.startsWith(ignored)).length;
}

function arrayRecords(value: unknown): Array<Record<string, unknown> | null> {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
