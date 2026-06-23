import type { SelectedFile } from "@/renderer/components/chat/SendBox";
import { parseQuoteMarkers, quoteMarkerPreview } from "@/renderer/utils/quoteMarkers";
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

export function prepareComposerMessage(value: string, files: SelectedFile[] = []): PreparedComposerMessage {
  const { message, quoteItems } = extractQuoteContext(value);
  const fileItems = files.map(fileContextItem);
  const contextItems = [...quoteItems, ...fileItems];
  const messageInjection = contextItems.map(contextItemToFollowInjection);
  return {
    message,
    contextItems,
    runtimeParams: messageInjection.length ? { message_injection: messageInjection } : undefined,
  };
}

function extractQuoteContext(value: string): { message: string; quoteItems: AgentContextItem[] } {
  const quoteItems: AgentContextItem[] = [];
  const message = parseQuoteMarkers(value)
    .map((segment) => {
      if (segment.type === "text") {
        return segment.value;
      }
      const index = quoteItems.length;
      const preview = quoteMarkerPreview(segment.value);
      quoteItems.push({
        id: `quote:${index}:${hashText(segment.value)}`,
        type: "quote",
        label: "引用片段",
        content: segment.value,
        role: "HumanMessage",
        source: "follow",
        metadata: {
          id: `quote:${index}:${hashText(segment.value)}`,
          kind: "quote",
          label: "引用片段",
          preview,
        },
      });
      return "";
    })
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { message, quoteItems };
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
  if (item.type === "quote") {
    return `用户添加了以下引用片段作为上下文：\n${item.content}`;
  }
  return item.content;
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
