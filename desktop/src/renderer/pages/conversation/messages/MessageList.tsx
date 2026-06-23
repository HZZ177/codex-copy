import { ArrowDown } from "lucide-react";
import {
  forwardRef,
  type ReactNode,
  type UIEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Virtuoso,
  type Components,
  type ItemProps,
  type ListProps,
  type ScrollerProps,
} from "react-virtuoso";

import type { RuntimeBridge, WorkspaceScope } from "@/runtime";
import type { ConversationMessage } from "@/renderer/stores/conversationStore";
import type { ConversationRuntimeState } from "@/renderer/stores/conversationStore";

import styles from "./MessageList.module.css";
import { ApprovalPrompt, type ApprovalDecisionHandler } from "./ApprovalPrompt";
import { CommandExecutionBlock } from "./CommandExecutionBlock";
import { ErrorItem } from "./ErrorItem";
import { FileChangeBlock, type FileChangePreview } from "./FileChangeBlock";
import { MessageGroupBlock } from "./MessageGroupBlock";
import { MessagePlan } from "./MessagePlan";
import { MessageThinking } from "./MessageThinking";
import { MessageActionFooter, MessageText } from "./MessageText";
import { ToolCallBlock } from "./ToolCallBlock";
import { processMessages, type ProcessedMessageItem } from "./processMessages";
import { useAutoScroll } from "./useAutoScroll";
import { useVirtuosoAutoScroll } from "./useVirtuosoAutoScroll";

const STATIC_MESSAGE_LIST_ITEM_LIMIT = 160;
const VIRTUAL_MESSAGE_VIEWPORT_BUFFER = { bottom: 2600, top: 1800 } as const;
const LOAD_OLDER_TRIGGER_PX = 44;
const LOAD_OLDER_ARM_PX = 120;

export interface MessageListProps {
  messages: ConversationMessage[];
  loading?: boolean;
  isProcessing?: boolean;
  emptyText?: string;
  emptyTestId?: string;
  runtimeState?: ConversationRuntimeState;
  runtimeDetail?: string | null;
  renderMessage?: (message: ConversationMessage) => ReactNode;
  workspaceRuntime?: RuntimeBridge;
  workspaceScope?: WorkspaceScope | null;
  onApprovalDecision?: ApprovalDecisionHandler;
  onFilePreview?: (file: FileChangePreview) => void;
  onQuoteSelection?: (text: string) => void;
  hasMoreOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void | Promise<void>;
  scrollButtonMode?: "inline" | "external";
  onScrollControlsChange?: (controls: MessageListScrollControls) => void;
}

export interface MessageListScrollControls {
  showScrollToBottom: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function MessageList({
  messages,
  loading = false,
  isProcessing = false,
  emptyText = "暂无消息",
  emptyTestId = "message-empty",
  renderMessage,
  workspaceRuntime,
  workspaceScope,
  onApprovalDecision,
  onFilePreview,
  onQuoteSelection,
  hasMoreOlder = false,
  loadingOlder = false,
  onLoadOlder,
  scrollButtonMode = "inline",
  onScrollControlsChange,
}: MessageListProps) {
  const olderLoadAnchorRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  const olderLoadRequestedRef = useRef(false);
  const olderLoadArmedRef = useRef(false);
  const virtualScrollerRef = useRef<HTMLElement | null>(null);
  const [showOlderTrigger, setShowOlderTrigger] = useState(false);
  const processedMessages = useMemo(() => processMessages(messages), [messages]);
  const pendingAssistantMessage = useMemo(
    () =>
      isProcessing && shouldShowPendingAssistantCursor(messages)
        ? createPendingAssistantMessage(messages)
        : null,
    [isProcessing, messages],
  );
  const displayItems = useMemo<ProcessedMessageItem[]>(() => {
    if (!pendingAssistantMessage) {
      return processedMessages;
    }
    return [
      ...processedMessages,
      {
        type: "message",
        id: pendingAssistantMessage.id,
        message: pendingAssistantMessage,
      },
    ];
  }, [pendingAssistantMessage, processedMessages]);
  const displayTurns = useMemo(() => groupDisplayItemsByTurn(displayItems), [displayItems]);
  const assistantTurnFooters = useMemo(
    () => collectAssistantTurnFooters(messages, displayItems, isProcessing),
    [displayItems, isProcessing, messages],
  );
  const useStaticList = shouldUseStaticMessageList(displayItems.length);
  const listMode = useStaticList ? "static" : "virtual";
  const staticAutoScroll = useAutoScroll({ deps: [displayTurns, isProcessing], itemCount: displayTurns.length });
  const autoScroll = useVirtuosoAutoScroll(displayTurns.length);
  const scrollControls = useStaticList ? staticAutoScroll : autoScroll;
  const canLoadOlder = Boolean(hasMoreOlder && onLoadOlder);
  const olderLoader = renderOlderLoader({ canLoadOlder, loadingOlder, showTrigger: showOlderTrigger });

  const requestLoadOlder = useCallback(
    (scroller: HTMLElement | null) => {
      if (
        !scroller ||
        !canLoadOlder ||
        loadingOlder ||
        olderLoadRequestedRef.current ||
        !olderLoadArmedRef.current ||
        scroller.scrollTop > LOAD_OLDER_TRIGGER_PX
      ) {
        return;
      }
      olderLoadRequestedRef.current = true;
      olderLoadAnchorRef.current = {
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
      };
      void onLoadOlder?.();
    },
    [canLoadOlder, loadingOlder, onLoadOlder],
  );

  const updateOlderLoadTrigger = useCallback(
    (scroller: HTMLElement | null) => {
      if (!scroller || !canLoadOlder || loadingOlder) {
        setShowOlderTrigger(false);
        return;
      }
      if (scroller.scrollTop > LOAD_OLDER_ARM_PX) {
        olderLoadArmedRef.current = true;
      }
      const nearTop = scroller.scrollTop <= LOAD_OLDER_TRIGGER_PX;
      setShowOlderTrigger(nearTop);
      if (nearTop) {
        requestLoadOlder(scroller);
      }
    },
    [canLoadOlder, loadingOlder, requestLoadOlder],
  );

  const handleStaticScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      staticAutoScroll.handleScroll(event);
      updateOlderLoadTrigger(event.currentTarget);
    },
    [staticAutoScroll, updateOlderLoadTrigger],
  );

  const handleVirtualScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      updateOlderLoadTrigger(event.currentTarget);
    },
    [updateOlderLoadTrigger],
  );

  const setVirtualScrollerRef = useCallback(
    (ref: HTMLElement | Window | null) => {
      const element = ref instanceof HTMLElement ? ref : null;
      virtualScrollerRef.current = element;
      autoScroll.setScrollerRef(ref);
    },
    [autoScroll],
  );

  const handleVirtualStartReached = useCallback(() => {
    updateOlderLoadTrigger(virtualScrollerRef.current);
  }, [updateOlderLoadTrigger]);

  const handleVirtualAtTopStateChange = useCallback(
    (atTop: boolean) => {
      if (atTop) {
        updateOlderLoadTrigger(virtualScrollerRef.current);
      }
    },
    [updateOlderLoadTrigger],
  );

  useEffect(() => {
    if (loading || !canLoadOlder) {
      olderLoadArmedRef.current = false;
      olderLoadRequestedRef.current = false;
      olderLoadAnchorRef.current = null;
      setShowOlderTrigger(false);
    }
  }, [canLoadOlder, isProcessing, listMode, loading, messages[0]?.id]);

  useLayoutEffect(() => {
    if (loadingOlder) {
      return;
    }
    const anchor = olderLoadAnchorRef.current;
    if (!anchor) {
      olderLoadRequestedRef.current = false;
      return;
    }
    const scroller = useStaticList ? staticAutoScroll.containerRef.current : virtualScrollerRef.current;
    if (!scroller) {
      olderLoadAnchorRef.current = null;
      olderLoadRequestedRef.current = false;
      return;
    }
    const nextScrollHeight = scroller.scrollHeight;
    scroller.scrollTop = nextScrollHeight - anchor.scrollHeight + anchor.scrollTop;
    olderLoadAnchorRef.current = null;
    olderLoadRequestedRef.current = false;
  }, [displayTurns.length, loadingOlder, staticAutoScroll.containerRef, useStaticList]);

  const virtualComponents = useMemo<Components<MessageTurn>>(
    () => ({
      ...messageVirtuosoComponents,
      Scroller: forwardRef<HTMLDivElement, ScrollerProps>(function MessageScroller(
        { children, style, onScroll, ...props },
        ref,
      ) {
        return (
          <div
            {...props}
            ref={ref}
            className={styles.scroller}
            data-testid="message-list-scroll"
            style={style}
            onScroll={(event) => {
              onScroll?.(event);
              handleVirtualScroll(event);
            }}
          >
            {children}
          </div>
        );
      }),
      Header: function MessageListTopLoader() {
        return olderLoader;
      },
    }),
    [handleVirtualScroll, olderLoader],
  );

  useEffect(() => {
    onScrollControlsChange?.({
      showScrollToBottom: scrollControls.showScrollToBottom,
      scrollToBottom: scrollControls.scrollToBottom,
    });
  }, [onScrollControlsChange, scrollControls.scrollToBottom, scrollControls.showScrollToBottom]);

  const messageListContent = useStaticList ? (
    <div
      ref={staticAutoScroll.containerRef}
      className={styles.scroller}
      data-testid="message-list-scroll"
      onPointerDown={staticAutoScroll.handlePointerDown}
      onScroll={handleStaticScroll}
      onWheel={staticAutoScroll.handleWheel}
    >
      <div ref={staticAutoScroll.contentRef} className={styles.list} role="list" aria-label="Messages">
        {olderLoader}
        {displayTurns.map((turn) => (
          <div className={styles.turnGroup} data-testid="message-turn" key={turn.id}>
            {renderMessageTurn({
              turn,
              renderMessage,
              assistantTurnFooters,
              workspaceRuntime,
              workspaceScope,
              onApprovalDecision,
              onFilePreview,
              onQuoteSelection,
            })}
          </div>
        ))}
      </div>
    </div>
  ) : (
    <Virtuoso
      ref={autoScroll.virtuosoRef}
      className={styles.virtualScroller}
      data={displayTurns}
      components={virtualComponents}
      computeItemKey={(_, turn) => turn.id}
      defaultItemHeight={120}
      increaseViewportBy={VIRTUAL_MESSAGE_VIEWPORT_BUFFER}
      initialTopMostItemIndex={{ align: "end", index: Math.max(0, displayTurns.length - 1) }}
      followOutput={autoScroll.followOutput}
      atBottomThreshold={8}
      atTopThreshold={LOAD_OLDER_TRIGGER_PX}
      atBottomStateChange={autoScroll.handleAtBottomStateChange}
      atTopStateChange={handleVirtualAtTopStateChange}
      totalListHeightChanged={autoScroll.handleTotalListHeightChanged}
      scrollerRef={setVirtualScrollerRef}
      startReached={handleVirtualStartReached}
      itemContent={(_, turn) =>
        renderMessageTurn({
          turn,
          renderMessage,
          assistantTurnFooters,
          workspaceRuntime,
          workspaceScope,
          onApprovalDecision,
          onFilePreview,
          onQuoteSelection,
        })
      }
    />
  );

  const list = (
    <section className={styles.root} data-list-mode={listMode} data-testid="message-list">
      {loading ? (
        <div className={styles.scroller} data-testid="message-list-scroll">
          <MessageSkeleton />
        </div>
      ) : messages.length ? (
        messageListContent
      ) : (
        <div className={styles.scroller} data-testid="message-list-scroll">
          <div className={styles.empty} data-testid={emptyTestId}>
            {emptyText}
          </div>
        </div>
      )}

      {scrollButtonMode === "inline" && scrollControls.showScrollToBottom ? (
        <button
          className={styles.scrollButton}
          type="button"
          aria-label="滚动到底"
          onClick={() => scrollControls.scrollToBottom()}
        >
          <ArrowDown size={15} />
          <span>滚动到底</span>
        </button>
      ) : null}
    </section>
  );

  return list;
}

const messageVirtuosoComponents: Components<MessageTurn> = {
  Scroller: forwardRef<HTMLDivElement, ScrollerProps>(function MessageScroller(
    { children, style, ...props },
    ref,
  ) {
    return (
      <div {...props} ref={ref} className={styles.scroller} data-testid="message-list-scroll" style={style}>
        {children}
      </div>
    );
  }),
  List: forwardRef<HTMLDivElement, ListProps>(function MessageListSurface({ children, style, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={`${styles.list} ${styles.virtualList}`}
        role="list"
        aria-label="娑堟伅鍒楄〃"
        style={style}
      >
        {children}
      </div>
    );
  }),
  Footer: function MessageListBottomSpacer() {
    return <div className={styles.virtualBottomSpacer} aria-hidden="true" />;
  },
  Item: function MessageItem({ children, style, ...props }: ItemProps<MessageTurn>) {
    return (
      <div {...props} className={styles.turnGroup} data-testid="message-turn" style={style}>
        {children}
      </div>
    );
  },
};

function renderOlderLoader({
  canLoadOlder,
  loadingOlder,
  showTrigger,
}: {
  canLoadOlder: boolean;
  loadingOlder: boolean;
  showTrigger: boolean;
}): ReactNode {
  if (!canLoadOlder && !loadingOlder) {
    return null;
  }
  return (
    <div
      className={styles.olderLoader}
      data-loading={loadingOlder ? "true" : "false"}
      data-visible={loadingOlder || showTrigger ? "true" : "false"}
    >
      {loadingOlder ? "加载更早对话..." : showTrigger ? "继续上滑加载更早对话" : ""}
    </div>
  );
}

function renderMessageTurn({
  turn,
  renderMessage,
  assistantTurnFooters,
  workspaceRuntime,
  workspaceScope,
  onApprovalDecision,
  onFilePreview,
  onQuoteSelection,
}: {
  turn: MessageTurn;
  renderMessage?: (message: ConversationMessage) => ReactNode;
  assistantTurnFooters: AssistantTurnFooters;
  workspaceRuntime?: RuntimeBridge;
  workspaceScope?: WorkspaceScope | null;
  onApprovalDecision?: ApprovalDecisionHandler;
  onFilePreview?: (file: FileChangePreview) => void;
  onQuoteSelection?: (text: string) => void;
}) {
  return turn.items.map((item) => (
    <div className={styles.item} data-kind={itemKind(item)} role="listitem" key={item.id}>
      {renderMessageItem({
        item,
        renderMessage,
        footerMessage: assistantTurnFooters.footerByItemId.get(item.id),
        workspaceRuntime,
        workspaceScope,
        onApprovalDecision,
        onFilePreview,
        onQuoteSelection,
      })}
    </div>
  ));
}

function renderMessageItem({
  item,
  renderMessage,
  footerMessage,
  workspaceRuntime,
  workspaceScope,
  onApprovalDecision,
  onFilePreview,
  onQuoteSelection,
}: {
  item: ProcessedMessageItem;
  renderMessage?: (message: ConversationMessage) => ReactNode;
  footerMessage?: ConversationMessage;
  workspaceRuntime?: RuntimeBridge;
  workspaceScope?: WorkspaceScope | null;
  onApprovalDecision?: ApprovalDecisionHandler;
  onFilePreview?: (file: FileChangePreview) => void;
  onQuoteSelection?: (text: string) => void;
}) {
  if (item.type === "message") {
    const renderedMessage = renderMessage ? (
      renderMessage(item.message)
    ) : (
      <DefaultMessage
        message={item.message}
        workspaceRuntime={workspaceRuntime}
        workspaceScope={workspaceScope}
        onApprovalDecision={onApprovalDecision}
        onFilePreview={onFilePreview}
        onQuoteSelection={onQuoteSelection}
      />
    );
    return withTurnActionFooter(renderedMessage, footerMessage);
  }

  const renderedGroup = (
    <MessageGroupBlock
      count={item.messages.length}
      groupKind={item.groupKind}
      messages={item.messages}
      sourceMessageIds={item.sourceMessageIds}
    >
      {item.messages.map((message) => (
        <DefaultMessage
          message={message}
          workspaceRuntime={workspaceRuntime}
          workspaceScope={workspaceScope}
          onApprovalDecision={onApprovalDecision}
          onFilePreview={onFilePreview}
          onQuoteSelection={onQuoteSelection}
          key={message.id}
        />
      ))}
    </MessageGroupBlock>
  );
  return withTurnActionFooter(renderedGroup, footerMessage);
}

function withTurnActionFooter(content: ReactNode, footerMessage?: ConversationMessage) {
  if (!footerMessage) {
    return content;
  }
  return (
    <>
      {content}
      <div className={styles.turnActionRow}>
        <MessageActionFooter message={footerMessage} placement="turn" />
      </div>
    </>
  );
}

function DefaultMessage({
  message,
  workspaceRuntime,
  workspaceScope,
  onApprovalDecision,
  onFilePreview,
  onQuoteSelection,
}: {
  message: ConversationMessage;
  workspaceRuntime?: RuntimeBridge;
  workspaceScope?: WorkspaceScope | null;
  onApprovalDecision?: ApprovalDecisionHandler;
  onFilePreview?: (file: FileChangePreview) => void;
  onQuoteSelection?: (text: string) => void;
}) {
  if (message.kind === "thinking") {
    return <MessageThinking message={message} />;
  }
  if (message.kind === "plan") {
    return <MessagePlan message={message} />;
  }
  if (message.kind === "tool") {
    return <ToolCallBlock message={message} />;
  }
  if (message.kind === "command") {
    return <CommandExecutionBlock message={message} />;
  }
  if (message.kind === "file_change") {
    return <FileChangeBlock message={message} onPreviewFile={onFilePreview} />;
  }
  if (message.kind === "approval") {
    return <ApprovalPrompt message={message} onDecision={onApprovalDecision} />;
  }
  if (message.kind === "error") {
    return <ErrorItem message={message} />;
  }
  return (
    <MessageText
      message={message}
      showActionRow={message.kind !== "assistant"}
      workspaceRuntime={workspaceRuntime}
      workspaceScope={workspaceScope}
      onQuoteSelection={onQuoteSelection}
    />
  );
}

function itemKind(item: ProcessedMessageItem): ConversationMessage["kind"] | string {
  return item.type === "message" ? item.message.kind : item.groupKind;
}

function shouldUseStaticMessageList(itemCount: number): boolean {
  const userAgent =
    typeof navigator === "undefined" || typeof navigator.userAgent !== "string"
      ? ""
      : navigator.userAgent.toLowerCase();
  if (typeof ResizeObserver === "undefined" || userAgent.includes("jsdom")) {
    return true;
  }
  return itemCount <= STATIC_MESSAGE_LIST_ITEM_LIMIT;
}

interface MessageTurn {
  id: string;
  items: ProcessedMessageItem[];
}

interface AssistantTurnFooters {
  footerByItemId: Map<string, ConversationMessage>;
}

function groupDisplayItemsByTurn(displayItems: ProcessedMessageItem[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let items: ProcessedMessageItem[] = [];

  const flush = () => {
    if (!items.length) {
      return;
    }
    turns.push({
      id: turnIdFromItems(items),
      items,
    });
    items = [];
  };

  displayItems.forEach((item) => {
    if (item.type === "message" && item.message.kind === "user") {
      flush();
    }
    items.push(item);
  });
  flush();

  return turns;
}

function turnIdFromItems(items: ProcessedMessageItem[]): string {
  const firstUserItem = items.find((item) => item.type === "message" && item.message.kind === "user");
  return `turn:${firstUserItem?.id ?? items[0].id}`;
}

function collectAssistantTurnFooters(
  messages: ConversationMessage[],
  displayItems: ProcessedMessageItem[],
  isProcessing: boolean,
): AssistantTurnFooters {
  const footerByItemId = new Map<string, ConversationMessage>();
  const itemIdByMessageId = mapMessageIdsToDisplayItems(displayItems);
  const activeTurnStart = messages.findLastIndex((message) => message.kind === "user") + 1;

  const placeTurnActionRow = (start: number, end: number) => {
    if (end < start || (isProcessing && end >= activeTurnStart)) {
      return;
    }
    const turnMessages = messages.slice(start, end + 1);
    const assistantMessage = [...turnMessages].reverse().find((message) => message.kind === "assistant");
    if (!assistantMessage) {
      return;
    }
    const lastDisplayMessage = [...turnMessages].reverse().find((message) => itemIdByMessageId.has(message.id));
    if (!lastDisplayMessage) {
      return;
    }
    const lastItemId = itemIdByMessageId.get(lastDisplayMessage.id);
    if (!lastItemId) {
      return;
    }
    footerByItemId.set(lastItemId, assistantMessage);
  };

  let turnStart = 0;
  messages.forEach((message, index) => {
    if (message.kind !== "user") {
      return;
    }
    placeTurnActionRow(turnStart, index - 1);
    turnStart = index + 1;
  });
  placeTurnActionRow(turnStart, messages.length - 1);

  return { footerByItemId };
}

function mapMessageIdsToDisplayItems(displayItems: ProcessedMessageItem[]): Map<string, string> {
  const itemIdByMessageId = new Map<string, string>();
  displayItems.forEach((item) => {
    if (item.type === "message") {
      itemIdByMessageId.set(item.message.id, item.id);
      return;
    }
    item.sourceMessageIds.forEach((messageId) => itemIdByMessageId.set(messageId, item.id));
  });
  return itemIdByMessageId;
}

function shouldShowPendingAssistantCursor(messages: ConversationMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last) {
    return false;
  }
  return !(last.kind === "assistant" && isStreamingStatus(last.status));
}

function createPendingAssistantMessage(messages: ConversationMessage[]): ConversationMessage {
  const last = messages[messages.length - 1];
  const now = last?.updatedAt ?? new Date(0).toISOString();
  return {
    id: "pending-assistant-cursor",
    threadId: last?.threadId ?? "",
    turnId: last?.turnId ?? null,
    itemId: null,
    kind: "assistant",
    status: "running",
    content: "",
    payload: {},
    createdAt: now,
    updatedAt: now,
  };
}

function isStreamingStatus(status: ConversationMessage["status"]): boolean {
  return status === "pending" || status === "running";
}

function MessageSkeleton() {
  return (
    <div className={styles.skeletonWrap} aria-label="姝ｅ湪鍔犺浇娑堟伅">
      {[0, 1, 2].map((item) => (
        <div className={styles.skeleton} data-testid="message-skeleton" key={item}>
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
