import type { WorkspaceFileAnnotationAnchorV2 } from "@/runtime";

export type AnnotationAnchorInvalidReason =
  | "missing"
  | "unsupported"
  | "invalid-range"
  | "content-hash-mismatch"
  | "source-text-mismatch";

export interface AnnotationAnchorValidation {
  anchor: WorkspaceFileAnnotationAnchorV2 | null;
  reason: AnnotationAnchorInvalidReason | null;
  valid: boolean;
}

export interface SourceLineColumn {
  column: number;
  line: number;
}

export function createSourceRangeAnchor(
  source: string,
  sourceStart: number,
  sourceEnd: number,
  createdInView: WorkspaceFileAnnotationAnchorV2["createdInView"],
  selectedText = source.slice(sourceStart, sourceEnd),
): WorkspaceFileAnnotationAnchorV2 {
  assertSourceRange(source, sourceStart, sourceEnd);
  const start = sourceLineColumnAtOffset(source, sourceStart);
  const end = sourceLineColumnAtOffset(source, sourceEnd);
  const sourceText = source.slice(sourceStart, sourceEnd);
  return {
    version: 2,
    kind: "source-range",
    sourceStart,
    sourceEnd,
    selectedText,
    sourceText,
    contentHash: filePreviewContentHash(source),
    lineStart: start.line,
    lineEnd: end.line,
    columnStart: start.column,
    columnEnd: end.column,
    createdInView,
  };
}

export function validateSourceRangeAnchor(
  source: string,
  value: unknown,
): AnnotationAnchorValidation {
  const anchor = annotationAnchorFromValue(value);
  if (!anchor) {
    return { anchor: null, reason: value == null ? "missing" : "unsupported", valid: false };
  }
  if (!isValidSourceRange(source, anchor.sourceStart, anchor.sourceEnd)) {
    return { anchor, reason: "invalid-range", valid: false };
  }
  if (anchor.contentHash !== filePreviewContentHash(source)) {
    return { anchor, reason: "content-hash-mismatch", valid: false };
  }
  if (source.slice(anchor.sourceStart, anchor.sourceEnd) !== anchor.sourceText) {
    return { anchor, reason: "source-text-mismatch", valid: false };
  }
  return { anchor, reason: null, valid: true };
}

export function annotationAnchorFromValue(value: unknown): WorkspaceFileAnnotationAnchorV2 | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.version !== 2 || raw.kind !== "source-range") {
    return null;
  }
  if (raw.createdInView !== "preview" && raw.createdInView !== "source") {
    return null;
  }
  const createdInView = raw.createdInView;
  const sourceStart = integerValue(raw.sourceStart);
  const sourceEnd = integerValue(raw.sourceEnd);
  const lineStart = positiveIntegerValue(raw.lineStart);
  const lineEnd = positiveIntegerValue(raw.lineEnd);
  const columnStart = positiveIntegerValue(raw.columnStart);
  const columnEnd = positiveIntegerValue(raw.columnEnd);
  const selectedText = stringValue(raw.selectedText);
  const sourceText = stringValue(raw.sourceText);
  const contentHash = stringValue(raw.contentHash);
  if (
    sourceStart === null ||
    sourceEnd === null ||
    lineStart === null ||
    lineEnd === null ||
    columnStart === null ||
    columnEnd === null ||
    !selectedText.trim() ||
    !sourceText ||
    !contentHash.trim()
  ) {
    return null;
  }
  return {
    version: 2,
    kind: "source-range",
    sourceStart,
    sourceEnd,
    selectedText,
    sourceText,
    contentHash,
    lineStart,
    lineEnd,
    columnStart,
    columnEnd,
    createdInView,
  };
}

export function isValidSourceRange(source: string, sourceStart: number, sourceEnd: number): boolean {
  return (
    Number.isInteger(sourceStart) &&
    Number.isInteger(sourceEnd) &&
    sourceStart >= 0 &&
    sourceEnd > sourceStart &&
    sourceEnd <= source.length
  );
}

export function sourceLineColumnAtOffset(source: string, offset: number): SourceLineColumn {
  const starts = sourceLineStartOffsets(source);
  const clampedOffset = Math.max(0, Math.min(offset, source.length));
  let lineIndex = 0;
  for (let index = 0; index < starts.length; index += 1) {
    if (starts[index] > clampedOffset) {
      break;
    }
    lineIndex = index;
  }
  return {
    line: lineIndex + 1,
    column: clampedOffset - starts[lineIndex] + 1,
  };
}

export function sourceLineStartOffsets(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n" && index + 1 < source.length) {
      starts.push(index + 1);
    }
  }
  return starts;
}

export function filePreviewContentHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function assertSourceRange(source: string, sourceStart: number, sourceEnd: number): void {
  if (!isValidSourceRange(source, sourceStart, sourceEnd)) {
    throw new RangeError("Invalid annotation source range");
  }
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function positiveIntegerValue(value: unknown): number | null {
  const integer = integerValue(value);
  return integer !== null && integer > 0 ? integer : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
