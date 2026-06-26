export interface SelectedQuote {
  id: string;
  text: string;
  preview: string;
  source: "selection" | "annotation";
  annotationComment?: string | null;
  file?: SelectedQuoteFileSource | null;
}

export interface SelectedQuoteFileSource {
  path: string;
  name?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  sourceStart?: number | null;
  sourceEnd?: number | null;
}

export interface SelectedQuoteOptions {
  source?: SelectedQuote["source"];
  annotationComment?: string | null;
  file?: SelectedQuoteFileSource | null;
}

export interface QuoteSelectionState {
  quotes: SelectedQuote[];
}

export type QuoteSelectionAction =
  | { type: "add"; quote: SelectedQuote }
  | { type: "remove"; id: string }
  | { type: "clear" };

export const initialQuoteSelectionState: QuoteSelectionState = {
  quotes: [],
};

export function quoteSelectionReducer(
  state: QuoteSelectionState,
  action: QuoteSelectionAction,
): QuoteSelectionState {
  switch (action.type) {
    case "add":
      if (!action.quote.text.trim()) {
        return state;
      }
      if (state.quotes.some((quote) => quote.id === action.quote.id)) {
        return state;
      }
      return { quotes: [...state.quotes, action.quote] };
    case "remove":
      return { quotes: state.quotes.filter((quote) => quote.id !== action.id) };
    case "clear":
      return initialQuoteSelectionState;
  }
}

export function selectedQuoteFromText(
  text: string,
  sourceOrOptions: SelectedQuote["source"] | SelectedQuoteOptions = "selection",
): SelectedQuote | null {
  const normalized = normalizeQuoteText(text);
  if (!normalized) {
    return null;
  }
  const options =
    typeof sourceOrOptions === "string"
      ? { source: sourceOrOptions }
      : sourceOrOptions;
  const source = options.source ?? "selection";
  const file = normalizeSelectedQuoteFileSource(options.file ?? null);
  const annotationComment = normalizeQuoteText(options.annotationComment ?? "");
  const idParts = ["quote", source, normalized];
  if (file) {
    idParts.push(
      file.path,
      String(file.lineStart ?? ""),
      String(file.lineEnd ?? ""),
      String(file.sourceStart ?? ""),
      String(file.sourceEnd ?? ""),
    );
  }
  if (annotationComment) {
    idParts.push(annotationComment);
  }
  return {
    id: `quote:${source}:${hashText(idParts.join("\n"))}`,
    text: normalized,
    preview: selectedQuotePreview(normalized),
    source,
    annotationComment: annotationComment || null,
    file,
  };
}

function normalizeSelectedQuoteFileSource(file: SelectedQuoteFileSource | null): SelectedQuoteFileSource | null {
  const path = file?.path.trim();
  if (!path) {
    return null;
  }
  const sourceStart = nonNegativeInteger(file?.sourceStart) ? file.sourceStart : null;
  const sourceEnd = positiveInteger(file?.sourceEnd) && sourceStart !== null && file.sourceEnd > sourceStart
    ? file.sourceEnd
    : null;
  return {
    path,
    name: file?.name?.trim() || fileName(path),
    lineStart: positiveInteger(file?.lineStart) ? file.lineStart : null,
    lineEnd: positiveInteger(file?.lineEnd) ? file.lineEnd : null,
    sourceStart: sourceEnd !== null ? sourceStart : null,
    sourceEnd,
  };
}

function positiveInteger(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function selectedQuotePreview(text: string): string {
  const firstLine = normalizeQuoteText(text).split("\n")[0] ?? "";
  if (firstLine.length <= 18) {
    return firstLine || "引用片段";
  }
  return `${firstLine.slice(0, 18)}...`;
}

function normalizeQuoteText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
