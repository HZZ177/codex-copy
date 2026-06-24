import type { SelectedFile } from "@/renderer/components/chat/SendBox/fileSelection";
import { selectedQuotePreview, type SelectedQuote } from "@/renderer/components/chat/SendBox/quoteSelection";
import type { AgentContextItem } from "@/types/protocol";

export interface RuntimeMessageInjectionItem {
  type: "follow" | "slot";
  role: "SystemMessage" | "HumanMessage" | "AIMessage";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeParamsWithInjection extends Record<string, unknown> {
  message_injection: RuntimeMessageInjectionItem[];
}

export interface PreparedComposerMessage {
  message: string;
  contextItems: AgentContextItem[];
  runtimeParams?: RuntimeParamsWithInjection;
}

export interface PrepareComposerMessageOptions {
  quotes?: SelectedQuote[];
}

export function prepareComposerMessage(
  value: string,
  files: SelectedFile[] = [],
  options: PrepareComposerMessageOptions = {},
): PreparedComposerMessage {
  const message = value.trim();
  const quoteItems = quoteContextItems(options.quotes ?? []);
  const fileItems = files.map(fileContextItem);
  const contextItems = [...quoteItems, ...fileItems];
  const messageInjection = contextItems.map(contextItemToFollowInjection);
  return {
    message,
    contextItems,
    runtimeParams: messageInjection.length ? { message_injection: messageInjection } : undefined,
  };
}

function quoteContextItems(quotes: SelectedQuote[]): AgentContextItem[] {
  return quotes.flatMap((quote, index) => {
    const content = quote.text.trim();
    if (!content) {
      return [];
    }
    const id = quote.id || `quote:${index}:${hashText(content)}`;
    const preview = quote.preview || selectedQuotePreview(content);
    if (quote.file) {
      return [
        {
          id,
          type: "source_quote",
          label: sourceQuoteLabel(quote),
          content,
          role: "HumanMessage",
          source: "follow",
          path: quote.file.path,
          name: quote.file.name || fileName(quote.file.path),
          fileType: "file",
          metadata: {
            id,
            kind: "source_quote",
            label: sourceQuoteLabel(quote),
            preview,
            source: quote.source,
            path: quote.file.path,
            name: quote.file.name || fileName(quote.file.path),
            fileType: "file",
            line_start: quote.file.lineStart ?? null,
            line_end: quote.file.lineEnd ?? null,
          },
        },
      ];
    }
    return [
      {
        id,
        type: "quote",
        label: "引用片段",
        content,
        role: "HumanMessage",
        source: "follow",
        metadata: {
          id,
          kind: "quote",
          label: "引用片段",
          preview,
          source: quote.source,
        },
      },
    ];
  });
}

function fileContextItem(file: SelectedFile, index: number): AgentContextItem {
  const id = `file:${index}:${hashText(file.path)}`;
  return {
    id,
    type: "file",
    label: file.name || file.path,
    content: file.type === "directory" ? `工作区目录：${file.path}` : `工作区文件：${file.path}`,
    role: "HumanMessage",
    source: "follow",
    path: file.path,
    name: file.name,
    fileType: file.type,
    metadata: {
      id,
      kind: "file",
      label: file.name || file.path,
      path: file.path,
      name: file.name,
      fileType: file.type,
      source: file.source,
    },
  };
}

function contextItemToFollowInjection(item: AgentContextItem): RuntimeMessageInjectionItem {
  return {
    type: "follow",
    role: "HumanMessage",
    content: injectionContent(item),
    metadata: {
      ...(item.metadata ?? {}),
      id: item.id,
      kind: item.type,
      label: item.label,
      path: item.path,
      name: item.name,
      fileType: item.fileType,
    },
  };
}

function injectionContent(item: AgentContextItem): string {
  if (item.type === "file") {
    const target = item.fileType === "directory" ? "目录" : "文件";
    return `用户通过 @ 引用了工作区${target}：${item.path || item.label}\n请在需要时使用文件工具读取或查看该路径，不要把路径当作用户普通文本。`;
  }
  if (item.type === "source_quote") {
    const lineRange = metadataLineRange(item.metadata);
    const location = lineRange ? `位置：${lineRange}\n` : "";
    return `用户引用了工作区文件中的一个自洽片段。\n文件：${item.path || item.label}\n${location}引用内容：\n${item.content}\n\n请把这条消息视为一个完整的文件来源片段，不要和其他文件或其他引用片段混淆。如需更多上下文，请使用文件工具读取该文件。`;
  }
  if (item.type === "quote") {
    return `用户添加了以下引用片段作为上下文：\n${item.content}`;
  }
  return item.content;
}

function sourceQuoteLabel(quote: SelectedQuote): string {
  const name = quote.file?.name || (quote.file?.path ? fileName(quote.file.path) : "文件片段");
  const lineRange = sourceQuoteLineRange(quote.file?.lineStart, quote.file?.lineEnd);
  return lineRange ? `${name} · ${lineRange}` : `${name} · 引用`;
}

function metadataLineRange(metadata: Record<string, unknown> | undefined): string | null {
  const start = numberValue(metadata?.line_start);
  const end = numberValue(metadata?.line_end);
  return sourceQuoteLineRange(start, end);
}

function sourceQuoteLineRange(start?: number | null, end?: number | null): string | null {
  if (!start || !end) {
    return null;
  }
  return start === end ? `L${start}` : `L${start}-L${end}`;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
