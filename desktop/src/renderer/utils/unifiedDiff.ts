export type UnifiedDiffLineKind = "add" | "delete" | "context" | "separator";

export interface UnifiedDiffDisplayLine {
  key: string;
  kind: UnifiedDiffLineKind;
  lineNumber: number | null;
  sign: "+" | "-" | "";
  content: string;
}

interface HunkPosition {
  oldLine: number;
  newLine: number;
}

export function parseUnifiedDiffDisplayLines(diff: string): UnifiedDiffDisplayLine[] {
  const sourceLines = diff ? diff.split("\n") : [];
  const rows: UnifiedDiffDisplayLine[] = [];
  let position: HunkPosition | null = null;
  let fallbackLine = 1;

  sourceLines.forEach((line, index) => {
    if (isDiffMetaLine(line)) {
      return;
    }

    const hunk = parseHunkHeader(line);
    if (hunk) {
      const omittedLineCount = position ? skippedUnmodifiedLineCount(position, hunk) : 0;
      if (omittedLineCount > 0 && rows.length > 0) {
        rows.push({
          key: `${index}:separator:${hunk.newLine}`,
          kind: "separator",
          lineNumber: null,
          sign: "",
          content: `省略 ${omittedLineCount} 行未修改内容`,
        });
      }
      position = hunk;
      return;
    }

    if (line.startsWith("\\ No newline")) {
      return;
    }

    if (line.startsWith("+")) {
      const lineNumber = position ? position.newLine++ : fallbackLine++;
      rows.push({
        key: `${index}:add:${lineNumber}`,
        kind: "add",
        lineNumber,
        sign: "+",
        content: line.slice(1),
      });
      return;
    }

    if (line.startsWith("-")) {
      const lineNumber = position ? position.oldLine++ : fallbackLine++;
      rows.push({
        key: `${index}:delete:${lineNumber}`,
        kind: "delete",
        lineNumber,
        sign: "-",
        content: line.slice(1),
      });
      return;
    }

    if (line.startsWith(" ")) {
      const lineNumber = position ? position.newLine : fallbackLine;
      if (position) {
        position.oldLine += 1;
        position.newLine += 1;
      } else {
        fallbackLine += 1;
      }
      rows.push({
        key: `${index}:context:${lineNumber}`,
        kind: "context",
        lineNumber,
        sign: "",
        content: line.slice(1),
      });
      return;
    }

    if (line.trim()) {
      rows.push({
        key: `${index}:context`,
        kind: "context",
        lineNumber: null,
        sign: "",
        content: line,
      });
    }
  });

  if (rows.length > 0) {
    return rows;
  }

  return [
    {
      key: "empty",
      kind: "context",
      lineNumber: null,
      sign: "",
      content: "暂无 diff",
    },
  ];
}

function parseHunkHeader(line: string): HunkPosition | null {
  const match = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
  if (!match) {
    return null;
  }
  return {
    oldLine: Number(match[1]),
    newLine: Number(match[2]),
  };
}

function skippedUnmodifiedLineCount(previous: HunkPosition, next: HunkPosition): number {
  const oldGap = next.oldLine - previous.oldLine;
  const newGap = next.newLine - previous.newLine;
  return Math.max(0, Math.max(oldGap, newGap));
}

function isDiffMetaLine(line: string): boolean {
  return (
    line.startsWith("diff --git ") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("*** Begin Patch") ||
    line.startsWith("*** End Patch") ||
    line.startsWith("*** Add File:") ||
    line.startsWith("*** Update File:") ||
    line.startsWith("*** Delete File:")
  );
}
