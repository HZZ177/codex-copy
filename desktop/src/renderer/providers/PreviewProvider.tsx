import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

import type { RuntimeBridge } from "@/runtime";

import type { PreviewRequest } from "./previewTypes";

const MAX_PREVIEW_ENTRIES = 8;
const GLOBAL_PREVIEW_SCOPE = "global";

export interface PreviewRenderContext {
  panelScopeKey?: string;
  workspaceId?: string;
  sessionId?: string;
  workspaceAvailable?: boolean;
  workspaceLabel?: string;
  runtime?: RuntimeBridge;
  onQuoteSelection?: (request: PreviewQuoteSelectionRequest) => void;
  onStartChatFromAnnotation?: (request: PreviewAnnotationChatRequest) => void;
}

export interface PreviewQuoteSelectionRequest {
  path: string;
  selectedText: string;
  lineStart?: number | null;
  lineEnd?: number | null;
  sourceStart?: number | null;
  sourceEnd?: number | null;
}

export interface PreviewFileRevealTarget {
  selectedText?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  sourceStart?: number | null;
  sourceEnd?: number | null;
}

export interface PreviewAnnotationChatRequest {
  path: string;
  comment: string;
  selectedText?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  sourceStart?: number | null;
  sourceEnd?: number | null;
}

export interface PreviewEntry {
  id: string;
  scopeKey: string;
  request: PreviewRequest;
  title: string;
  sourceLabel: string;
  openedAt: number;
  renderContext: PreviewRenderContext | null;
}

export interface FilePanelRequest {
  requestId: number;
  scopeKey: string;
  path: string | null;
  revealTarget: PreviewFileRevealTarget | null;
  renderContext: PreviewRenderContext | null;
}

export interface PreviewState {
  open: boolean;
  panelOpen: boolean;
  panelActiveEntryId: string | null;
  collapseRequestId: number;
  request: PreviewRequest | null;
  targetPath: string | null;
  entries: PreviewEntry[];
  activeEntryId: string | null;
  hostContext: PreviewRenderContext | null;
  filePanelRequest: FilePanelRequest | null;
}

export interface PreviewContextValue extends PreviewState {
  activeEntry: PreviewEntry | null;
  activeRenderContext: PreviewRenderContext | null;
  activeScopeKey: string;
  openPreview(request: PreviewRequest | string, renderContext?: PreviewRenderContext): void;
  openFilePanel(path?: string | null, renderContext?: PreviewRenderContext, revealTarget?: PreviewFileRevealTarget | null): void;
  togglePreview(request: PreviewRequest | string, renderContext?: PreviewRenderContext): void;
  switchPreview(entryId: string): void;
  closePreviewEntry(entryId: string): void;
  closePreview(): void;
  setPreviewPanelOpen(open: boolean, activeEntryId?: string | null): void;
  setPreviewHostContext(context: PreviewRenderContext | null): void;
}

interface PreviewScopeState {
  open: boolean;
  activeEntryId: string | null;
}

interface PreviewStoreState {
  entries: PreviewEntry[];
  scopes: Record<string, PreviewScopeState>;
  hostContext: PreviewRenderContext | null;
  panelOpen: boolean;
  panelActiveEntryId: string | null;
  collapseRequestId: number;
  filePanelRequest: FilePanelRequest | null;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function PreviewProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<PreviewStoreState>({
    entries: [],
    scopes: {},
    hostContext: null,
    panelOpen: false,
    panelActiveEntryId: null,
    collapseRequestId: 0,
    filePanelRequest: null,
  });

  const openPreview = useCallback((request: PreviewRequest | string, renderContext?: PreviewRenderContext) => {
    setState((current) => {
      return openPreviewInStore(current, request, renderContext, "append");
    });
  }, []);

  const openFilePanel = useCallback((
    path: string | null = null,
    renderContext?: PreviewRenderContext,
    revealTarget: PreviewFileRevealTarget | null = null,
  ) => {
    setState((current) => {
      const context = renderContext ?? current.hostContext;
      return {
        ...current,
        hostContext: context ?? current.hostContext,
        filePanelRequest: {
          requestId: (current.filePanelRequest?.requestId ?? 0) + 1,
          scopeKey: previewScopeKey(context),
          path: path || null,
          revealTarget,
          renderContext: context,
        },
      };
    });
  }, []);

  const togglePreview = useCallback((request: PreviewRequest | string, renderContext?: PreviewRenderContext) => {
    setState((current) => {
      const normalizedRequest = normalizePreviewRequest(request);
      const context = renderContext ?? current.hostContext;
      const scopeKey = previewScopeKey(context);
      const entry = createPreviewEntry(normalizedRequest, context, scopeKey);
      const scopeState = current.scopes[scopeKey] ?? { open: false, activeEntryId: null };

      if (current.panelOpen && scopeState.open && current.panelActiveEntryId === entry.id) {
        return {
          ...current,
          collapseRequestId: current.collapseRequestId + 1,
        };
      }

      return openPreviewInStore(current, normalizedRequest, context, "preserve-order");
    });
  }, []);

  const switchPreview = useCallback((entryId: string) => {
    setState((current) => {
      const entry = current.entries.find((item) => item.id === entryId);
      if (!entry) {
        return current;
      }
      return {
        ...current,
        scopes: {
          ...current.scopes,
          [entry.scopeKey]: {
            open: true,
            activeEntryId: entry.id,
          },
        },
      };
    });
  }, []);

  const closePreviewEntry = useCallback((entryId: string) => {
    setState((current) => {
      const closedEntry = current.entries.find((entry) => entry.id === entryId);
      if (!closedEntry) {
        return current;
      }
      const scopeKey = closedEntry.scopeKey;
      const scopeState = current.scopes[scopeKey] ?? { open: false, activeEntryId: null };
      const scopeEntries = current.entries.filter((entry) => entry.scopeKey === scopeKey);
      const closedIndex = scopeEntries.findIndex((entry) => entry.id === entryId);
      const entries = current.entries.filter((entry) => entry.id !== entryId);
      const remainingScopeEntries = scopeEntries.filter((entry) => entry.id !== entryId);
      if (remainingScopeEntries.length === 0) {
        return {
          ...current,
          entries,
          scopes: {
            ...current.scopes,
            [scopeKey]: {
              open: false,
              activeEntryId: null,
            },
          },
        };
      }
      if (scopeState.activeEntryId !== entryId) {
        return { ...current, entries };
      }
      const nextEntry = remainingScopeEntries[Math.max(0, Math.min(closedIndex - 1, remainingScopeEntries.length - 1))];
      return {
        ...current,
        entries,
        scopes: {
          ...current.scopes,
          [scopeKey]: {
            open: true,
            activeEntryId: nextEntry.id,
          },
        },
      };
    });
  }, []);

  const closePreview = useCallback(() => {
    setState((current) => {
      const scopeKey = previewScopeKey(current.hostContext);
      return {
        ...current,
        scopes: {
          ...current.scopes,
          [scopeKey]: {
            open: false,
            activeEntryId: null,
          },
        },
      };
    });
  }, []);

  const setPreviewPanelOpen = useCallback((open: boolean, activeEntryId: string | null = null) => {
    setState((current) => {
      const panelActiveEntryId = open ? activeEntryId : null;
      if (current.panelOpen === open && current.panelActiveEntryId === panelActiveEntryId) {
        return current;
      }
      return { ...current, panelOpen: open, panelActiveEntryId };
    });
  }, []);

  const setPreviewHostContext = useCallback((context: PreviewRenderContext | null) => {
    setState((current) => {
      if (samePreviewRenderContext(current.hostContext, context)) {
        return current;
      }
      return { ...current, hostContext: context };
    });
  }, []);

  const activeScopeKey = previewScopeKey(state.hostContext);
  const entries = useMemo(
    () => state.entries.filter((entry) => entry.scopeKey === activeScopeKey),
    [activeScopeKey, state.entries],
  );
  const scopeState = state.scopes[activeScopeKey] ?? { open: false, activeEntryId: null };
  const activeEntry = scopeState.open ? (entries.find((entry) => entry.id === scopeState.activeEntryId) ?? null) : null;
  const activeRenderContext = activeEntry?.renderContext ?? state.hostContext;
  const request = activeEntry?.request ?? null;
  const activeEntryId = activeEntry?.id ?? null;
  const targetPath = request ? targetPathForRequest(request) : null;
  const open = Boolean(activeEntry && scopeState.open);

  const value = useMemo<PreviewContextValue>(
    () => ({
      open,
      panelOpen: state.panelOpen,
      panelActiveEntryId: state.panelActiveEntryId,
      collapseRequestId: state.collapseRequestId,
      request,
      targetPath,
      entries,
      activeEntryId,
      hostContext: state.hostContext,
      filePanelRequest: state.filePanelRequest,
      activeEntry,
      activeRenderContext,
      activeScopeKey,
      openPreview,
      openFilePanel,
      togglePreview,
      switchPreview,
      closePreviewEntry,
      closePreview,
      setPreviewPanelOpen,
      setPreviewHostContext,
    }),
    [
      activeEntryId,
      activeEntry,
      activeRenderContext,
      activeScopeKey,
      closePreview,
      closePreviewEntry,
      entries,
      open,
      openPreview,
      openFilePanel,
      togglePreview,
      request,
      setPreviewPanelOpen,
      setPreviewHostContext,
      state.collapseRequestId,
      state.hostContext,
      state.filePanelRequest,
      state.panelActiveEntryId,
      state.panelOpen,
      switchPreview,
      targetPath,
    ],
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

type PreviewEntryPlacement = "append" | "preserve-order";

function openPreviewInStore(
  current: PreviewStoreState,
  request: PreviewRequest | string,
  renderContext: PreviewRenderContext | null | undefined,
  placement: PreviewEntryPlacement,
): PreviewStoreState {
  const normalizedRequest = normalizePreviewRequest(request);
  const context = renderContext ?? current.hostContext;
  const scopeKey = previewScopeKey(context);
  const entry = createPreviewEntry(normalizedRequest, context, scopeKey);
  const existingEntry = current.entries.find((item) => item.id === entry.id);

  if (existingEntry && placement === "preserve-order") {
    return {
      ...current,
      entries: current.entries.map((item) => (item.id === entry.id ? entry : item)),
      scopes: {
        ...current.scopes,
        [scopeKey]: {
          open: true,
          activeEntryId: entry.id,
        },
      },
    };
  }

  const retainedEntries = current.entries.filter((item) => item.id !== entry.id);
  const scopeEntries = [...retainedEntries.filter((item) => item.scopeKey === scopeKey), entry].slice(
    -MAX_PREVIEW_ENTRIES,
  );
  const entries = [...retainedEntries.filter((item) => item.scopeKey !== scopeKey), ...scopeEntries];

  return {
    ...current,
    entries,
    scopes: {
      ...current.scopes,
      [scopeKey]: {
        open: true,
        activeEntryId: entry.id,
      },
    },
  };
}

function normalizePreviewRequest(request: PreviewRequest | string): PreviewRequest {
  return typeof request === "string" ? { type: "file", path: request } : request;
}

function createPreviewEntry(
  request: PreviewRequest,
  renderContext: PreviewRenderContext | null,
  scopeKey: string,
): PreviewEntry {
  return {
    id: `${scopeKey}:${previewEntryId(request)}`,
    scopeKey,
    request,
    title: previewTitle(request),
    sourceLabel: previewSourceLabel(request),
    openedAt: Date.now(),
    renderContext,
  };
}

function previewScopeKey(context: PreviewRenderContext | null | undefined): string {
  if (context?.panelScopeKey) {
    return context.panelScopeKey;
  }
  if (context?.sessionId) {
    return `session:${context.sessionId}`;
  }
  if (context?.workspaceId) {
    return `workspace:${context.workspaceId}`;
  }
  return GLOBAL_PREVIEW_SCOPE;
}

function samePreviewRenderContext(left: PreviewRenderContext | null, right: PreviewRenderContext | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left?.workspaceId === right?.workspaceId &&
    left?.sessionId === right?.sessionId &&
    left?.panelScopeKey === right?.panelScopeKey &&
    left?.workspaceAvailable === right?.workspaceAvailable &&
    left?.workspaceLabel === right?.workspaceLabel &&
    left?.runtime === right?.runtime &&
    left?.onQuoteSelection === right?.onQuoteSelection &&
    left?.onStartChatFromAnnotation === right?.onStartChatFromAnnotation
  );
}

function previewEntryId(request: PreviewRequest): string {
  if (request.type === "file") {
    return `file:${request.path}`;
  }
  if (request.type === "diff") {
    return `diff:${request.path}:${hashText(request.diff)}`;
  }
  return `content:${request.contentType}:${request.title}:${hashText(request.content)}`;
}

function previewTitle(request: PreviewRequest): string {
  if (request.type === "content") {
    return request.title;
  }
  return fileName(request.path);
}

function previewSourceLabel(request: PreviewRequest): string {
  if (request.type === "content") {
    return request.sourcePath ?? "消息内容";
  }
  return request.path;
}

function targetPathForRequest(request: PreviewRequest): string | null {
  if ("path" in request) {
    return request.path;
  }
  return request.sourcePath ?? null;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function hashText(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function usePreview() {
  const value = useContext(PreviewContext);
  if (!value) {
    throw new Error("usePreview 必须在 PreviewProvider 内使用");
  }
  return value;
}

export function useOptionalPreview() {
  return useContext(PreviewContext);
}

export type { PreviewContentKind, PreviewRequest } from "./previewTypes";
