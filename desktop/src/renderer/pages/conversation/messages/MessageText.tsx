import { Check, Copy } from "lucide-react";
import { useMemo, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";

import type { RuntimeBridge, WorkspaceScope } from "@/runtime";
import type { ConversationMessage } from "@/renderer/stores/conversationStore";
import { quoteMarkersToMarkdownLinks, quoteTextFromMarkdownHref } from "@/renderer/utils/quoteMarkers";

import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import { MessageGhostFooter, type MessageGhostFooterData } from "./MessageGhostFooter";
import { MarkdownImage } from "./MarkdownImage";
import { MarkdownTable } from "./MarkdownTable";
import { SelectionToolbar } from "./SelectionToolbar";
import {
  copyText,
  formatMessageTime,
  markdownRehypePlugins,
  markdownRemarkPlugins,
  normalizeMarkdownContent,
  redactTextualToolProtocol,
  stripThinkTags,
  textualToolProtocolNotice,
} from "./markdown";
import { useTextSelection } from "./useTextSelection";
import { useTypingAnimation } from "./useTypingAnimation";
import styles from "./MessageText.module.css";

export interface MessageTextProps {
  message: ConversationMessage;
  showActionRow?: boolean;
  workspaceRuntime?: RuntimeBridge;
  workspaceScope?: WorkspaceScope | null;
  onQuoteSelection?: (text: string) => void;
}

export function MessageText({
  message,
  showActionRow = true,
  workspaceRuntime,
  workspaceScope,
  onQuoteSelection,
}: MessageTextProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const isUser = message.kind === "user";
  const isStreaming = message.status === "pending" || message.status === "running";
  const selection = useTextSelection(contentRef, Boolean(onQuoteSelection));
  const cancelled = message.status === "cancelled" || message.payload.cancelled === true;
  const assistantContent = useMemo(
    () => redactTextualToolProtocol(stripThinkTags(message.content)),
    [message.content],
  );
  const content = isUser ? quoteMarkersToMarkdownLinks(message.content) : assistantContent.content;
  const ghostFooter = useMemo(
    () => (isUser ? null : ghostFooterFromPayload(message.payload)),
    [isUser, message.payload],
  );
  const animationContent = useMemo(() => normalizeMarkdownContent(content), [content]);
  const { displayedContent, isAnimating } = useTypingAnimation({
    content: animationContent,
    enabled: !isUser && isStreaming,
    completeImmediately: isUser || cancelled,
    resetKey: message.id,
  });
  const hasPendingDisplayBacklog =
    !isUser &&
    isStreaming &&
    displayedContent.length < animationContent.length &&
    animationContent.startsWith(displayedContent);
  const visuallyStreaming = isStreaming || isAnimating;
  const renderedContent = useMemo(
    () => normalizeMarkdownContent(displayedContent, { streaming: !isUser && visuallyStreaming }),
    [displayedContent, isUser, visuallyStreaming],
  );
  const activeStreamingFence = useMemo(
    () => (!isUser && visuallyStreaming ? findActiveStreamingFence(displayedContent) : null),
    [displayedContent, isUser, visuallyStreaming],
  );
  const showStreamingCursor = !isUser && isStreaming && !isAnimating && !hasPendingDisplayBacklog && !cancelled;
  const markdownComponents = useMemo(
    () => ({
      pre: ({ node, ...props }: MarkdownPreProps) => (
        <MarkdownCodeBlock
          {...props}
          streaming={!isUser && visuallyStreaming && isNodeInsideActiveFence(node, activeStreamingFence)}
        />
      ),
      table: MarkdownTable,
      a: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <MarkdownAnchor {...props} />,
      img: (props: Parameters<typeof MarkdownImage>[0]) => (
        <MarkdownImage {...props} runtime={workspaceRuntime} workspaceScope={workspaceScope} />
      ),
    }),
    [activeStreamingFence, isUser, visuallyStreaming, workspaceRuntime, workspaceScope],
  );

  return (
    <article className={isUser ? styles.userMessage : styles.assistantMessage} data-testid="message-text">
      <div className={styles.bubble}>
        {!isUser && assistantContent.redacted ? (
          <div className={styles.protocolNotice} role="note">
            {textualToolProtocolNotice}
          </div>
        ) : null}
        <div className="codex-markdown" ref={contentRef}>
          <ReactMarkdown
            remarkPlugins={markdownRemarkPlugins}
            rehypePlugins={markdownRehypePlugins}
            components={markdownComponents}
            urlTransform={markdownUrlTransform}
          >
            {renderedContent}
          </ReactMarkdown>
          {showStreamingCursor ? (
            <span className={styles.streamingCursor} data-testid="streaming-cursor" aria-hidden="true">
              <span className={styles.streamingDot} />
              <span className={styles.streamingDot} />
              <span className={styles.streamingDot} />
            </span>
          ) : null}
        </div>
        {cancelled ? <div className={styles.cancelledBadge}>已中断</div> : null}
        {onQuoteSelection ? (
          <SelectionToolbar
            selectedText={selection.selectedText}
            position={selection.selectionPosition}
            onQuote={onQuoteSelection}
            onClear={selection.clearSelection}
          />
        ) : null}
      </div>
      <MessageGhostFooter footer={ghostFooter} />

      {!visuallyStreaming && showActionRow ? (
        <MessageActionFooter message={message} />
      ) : null}
    </article>
  );
}

export function MessageActionFooter({
  message,
  placement = "inline",
}: {
  message: ConversationMessage;
  placement?: "inline" | "turn";
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const time = formatMessageTime(message.updatedAt || message.createdAt);

  const handleCopy = async () => {
    try {
      await copyText(message.content);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <footer
      className={styles.actions}
      data-copy-state={copyState}
      data-message-kind={message.kind}
      data-placement={placement}
    >
      <button className={styles.actionButton} type="button" aria-label="复制消息" onClick={handleCopy}>
        {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
        <span>{copyState === "failed" ? "复制失败" : copyState === "copied" ? "已复制" : "复制"}</span>
      </button>
      {time ? <time dateTime={message.updatedAt || message.createdAt}>{time}</time> : null}
    </footer>
  );
}

function MarkdownAnchor({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const quoteText = quoteTextFromMarkdownHref(href);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  if (quoteText) {
    const handleCopy = async () => {
      await copyText(quoteText);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1200);
    };
    return (
      <span className={styles.quoteReferenceWrapper}>
        <span className={styles.quoteReferenceChip} tabIndex={0}>
          {children}
        </span>
        <span className={styles.quoteReferenceCard} onMouseDown={(event) => event.preventDefault()}>
          <span className={styles.quoteReferenceBody}>{quoteText}</span>
          <span className={styles.quoteReferenceActions}>
            <button type="button" onClick={handleCopy}>
              {copyState === "copied" ? "已复制" : "复制"}
            </button>
          </span>
        </span>
      </span>
    );
  }
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

function markdownUrlTransform(url: string): string | null | undefined {
  if (quoteTextFromMarkdownHref(url)) {
    return url;
  }
  return defaultUrlTransform(url);
}

function ghostFooterFromPayload(payload: Record<string, unknown>): MessageGhostFooterData | null {
  const footer: MessageGhostFooterData = {
    duration: formatDuration(payload.duration_ms ?? payload.durationMs),
  };

  return footer.duration ? footer : null;
}

function formatDuration(value: unknown): string | undefined {
  const ms = numberValue(value);
  if (ms === undefined) {
    return undefined;
  }
  const seconds = ms / 1000;
  return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)} 秒`;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

interface MarkdownPreProps {
  children?: ReactNode;
  node?: MarkdownNode;
}

interface MarkdownNode {
  position?: MarkdownNodePosition;
}

interface MarkdownNodePosition {
  start?: {
    line?: number;
    offset?: number;
  };
  end?: {
    line?: number;
    offset?: number;
  };
}

interface ActiveStreamingFence {
  contentStartLine: number;
  contentStartOffset: number;
  startLine: number;
  startOffset: number;
}

function findActiveStreamingFence(content: string): ActiveStreamingFence | null {
  const lines = content.split("\n");
  let activeFence:
    | {
        marker: "`" | "~";
        length: number;
        contentStartLine: number;
        contentStartOffset: number;
        startLine: number;
        startOffset: number;
      }
    | null = null;
  let lineStartOffset = 0;

  lines.forEach((line, index) => {
    const match = /^(\s*)(`{3,}|~{3,})/.exec(line);
    const lineNumber = index + 1;
    const nextLineOffset = lineStartOffset + line.length + (index < lines.length - 1 ? 1 : 0);

    if (!match) {
      lineStartOffset = nextLineOffset;
      return;
    }

    const markerText = match[2];
    const marker = markerText[0] as "`" | "~";
    if (!activeFence) {
      activeFence = {
        marker,
        length: markerText.length,
        startLine: lineNumber,
        startOffset: lineStartOffset,
        contentStartLine: lineNumber + 1,
        contentStartOffset: nextLineOffset,
      };
      lineStartOffset = nextLineOffset;
      return;
    }

    if (activeFence.marker === marker && markerText.length >= activeFence.length) {
      activeFence = null;
    }
    lineStartOffset = nextLineOffset;
  });

  return activeFence;
}

function isNodeInsideActiveFence(node: MarkdownNode | undefined, fence: ActiveStreamingFence | null): boolean {
  if (!fence) {
    return false;
  }

  const position = node?.position;
  const startOffset = position?.start?.offset;
  const endOffset = position?.end?.offset;
  if (isFiniteNumber(startOffset) && isFiniteNumber(endOffset)) {
    return startOffset <= fence.contentStartOffset && endOffset >= fence.startOffset;
  }

  const startLine = position?.start?.line;
  const endLine = position?.end?.line;
  if (isFiniteNumber(startLine) && isFiniteNumber(endLine)) {
    return startLine <= fence.contentStartLine && endLine >= fence.startLine;
  }

  return false;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
