export interface QuoteMarkerTextSegment {
  type: "text";
  value: string;
}

export interface QuoteMarkerQuoteSegment {
  type: "quote";
  value: string;
  marker: string;
}

export type QuoteMarkerSegment = QuoteMarkerTextSegment | QuoteMarkerQuoteSegment;

const QUOTE_START = "[[";
const QUOTE_END = "]]";
const ESCAPED_END = `]\u200c]`;
const QUOTE_LINK_PREFIX = "keydex-quote:";

export function createQuoteMarker(text: string): string {
  const normalized = normalizeQuoteText(text);
  return normalized ? `${QUOTE_START}${escapeQuoteMarkerText(normalized)}${QUOTE_END}` : "";
}

export function hasQuoteMarkers(text: string): boolean {
  return parseQuoteMarkers(text).some((segment) => segment.type === "quote");
}

export function parseQuoteMarkers(text: string): QuoteMarkerSegment[] {
  const segments: QuoteMarkerSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(QUOTE_START, cursor);
    if (start < 0) {
      pushTextSegment(segments, text.slice(cursor));
      break;
    }

    const end = text.indexOf(QUOTE_END, start + QUOTE_START.length);
    if (end < 0) {
      pushTextSegment(segments, text.slice(cursor));
      break;
    }

    pushTextSegment(segments, text.slice(cursor, start));
    const rawValue = text.slice(start + QUOTE_START.length, end);
    const value = unescapeQuoteMarkerText(rawValue).trim();
    if (value) {
      segments.push({
        type: "quote",
        value,
        marker: text.slice(start, end + QUOTE_END.length),
      });
    } else {
      pushTextSegment(segments, text.slice(start, end + QUOTE_END.length));
    }
    cursor = end + QUOTE_END.length;
  }

  return segments.length ? segments : [{ type: "text", value: text }];
}

export function removeQuoteMarkerAtIndex(text: string, quoteIndex: number): string {
  let currentQuoteIndex = 0;
  return parseQuoteMarkers(text)
    .map((segment) => {
      if (segment.type === "text") {
        return segment.value;
      }
      const keep = currentQuoteIndex !== quoteIndex;
      currentQuoteIndex += 1;
      return keep ? segment.marker : "";
    })
    .join("");
}

export function quoteMarkersToMarkdownLinks(text: string): string {
  if (!hasQuoteMarkers(text)) {
    return text;
  }
  return parseQuoteMarkers(text)
    .map((segment) => {
      if (segment.type === "text") {
        return segment.value;
      }
      return `[引用片段](${QUOTE_LINK_PREFIX}${encodeURIComponent(segment.value)})`;
    })
    .join("");
}

export function quoteTextFromMarkdownHref(href: string | undefined): string | null {
  if (!href?.startsWith(QUOTE_LINK_PREFIX)) {
    return null;
  }
  try {
    return decodeURIComponent(href.slice(QUOTE_LINK_PREFIX.length));
  } catch {
    return null;
  }
}

export function quoteMarkerPreview(text: string): string {
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

function escapeQuoteMarkerText(text: string): string {
  return text.replaceAll(QUOTE_END, ESCAPED_END);
}

function unescapeQuoteMarkerText(text: string): string {
  return text.replaceAll(ESCAPED_END, QUOTE_END);
}

function pushTextSegment(segments: QuoteMarkerSegment[], value: string) {
  if (!value) {
    return;
  }
  const last = segments.at(-1);
  if (last?.type === "text") {
    last.value += value;
    return;
  }
  segments.push({ type: "text", value });
}
