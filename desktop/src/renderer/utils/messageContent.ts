export function normalizeMessageContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(normalizeMessageContent).filter(Boolean).join("\n");
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "value"]) {
      if (key in record) {
        const normalized = normalizeMessageContent(record[key]);
        if (normalized) {
          return normalized;
        }
      }
    }
    return stringifyContent(value);
  }
  return "";
}

function stringifyContent(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
