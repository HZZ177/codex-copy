import {
  Check,
  ChevronRight,
  Code2,
  Columns2,
  Copy,
  Eye,
  MessageSquarePlus,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Send,
  Target,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { css as cssLanguage } from "@codemirror/lang-css";
import { html as htmlLanguage } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json as jsonLanguage } from "@codemirror/lang-json";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
  EditorView,
  keymap,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown, { type Components } from "react-markdown";

import type { RuntimeBridge, WorkspaceFileAnnotation, WorkspaceMediaResponse, WorkspaceScope } from "@/runtime";
import { MarkdownImage } from "@/renderer/pages/conversation/messages/MarkdownImage";
import { MarkdownTable } from "@/renderer/pages/conversation/messages/MarkdownTable";
import { SelectionToolbar } from "@/renderer/pages/conversation/messages/SelectionToolbar";
import {
  copyText,
  markdownRehypePlugins,
  markdownRemarkPlugins,
  normalizeMarkdownContent,
} from "@/renderer/pages/conversation/messages/markdown";
import { useTextSelection } from "@/renderer/pages/conversation/messages/useTextSelection";
import {
  useOptionalPreview,
  type PreviewAnnotationChatRequest,
  type PreviewQuoteSelectionRequest,
} from "@/renderer/providers/PreviewProvider";
import type { PreviewContentKind, PreviewRequest } from "@/renderer/providers/previewTypes";
import { formatMermaidCssPixels, normalizeMermaidSvgDimensions, type SvgDimensions } from "@/renderer/utils/mermaidSvg";
import { parseUnifiedDiffDisplayLines } from "@/renderer/utils/unifiedDiff";

import styles from "./FilePreview.module.css";

export type FilePreviewRequest = PreviewRequest;

type AnnotationWorkspaceRuntime = Pick<
  RuntimeBridge["workspace"],
  "listAnnotations" | "createAnnotation" | "updateAnnotation" | "deleteAnnotation"
>;

export interface FilePreviewProps {
  workspaceId?: string;
  sessionId?: string;
  request: FilePreviewRequest;
  runtime?: RuntimeBridge;
  onQuoteSelection?: (request: PreviewQuoteSelectionRequest) => void;
  onStartChatFromAnnotation?: (request: PreviewAnnotationChatRequest) => void;
  onClose?: () => void;
  chrome?: "default" | "panel";
  breadcrumbRootLabel?: string;
  hideBreadcrumbs?: boolean;
}

export function FilePreview({
  workspaceId,
  sessionId,
  request,
  runtime,
  onQuoteSelection,
  onStartChatFromAnnotation,
  onClose,
  chrome = "default",
  breadcrumbRootLabel,
  hideBreadcrumbs = false,
}: FilePreviewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelChrome = chrome === "panel";
  const kind = useMemo(() => detectPreviewKind(request), [request]);
  const immediateContent = useMemo(() => immediatePreviewContent(request), [request]);
  const [content, setContent] = useState(() => immediatePreviewContent(request) ?? "");
  const [media, setMedia] = useState<WorkspaceMediaResponse | null>(null);
  const [loading, setLoading] = useState(request.type === "file");
  const previewContent = immediateContent ?? content;
  const previewLoading = immediateContent === null ? loading : false;
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");
  const [splitMode, setSplitMode] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [theme, setTheme] = useState<"light" | "dark">(() => getTheme());
  const previewContext = useOptionalPreview();
  const previewEntries = previewContext?.entries ?? [];
  const activePreviewId = previewContext?.activeEntryId ?? null;
  const showPreviewTabs = previewEntries.length > 1;
  const scope = useMemo(() => workspaceScope({ workspaceId, sessionId }), [workspaceId, sessionId]);
  const annotationPath = request.type === "file" ? request.path : null;
  const annotationRuntime = useMemo(() => annotationWorkspaceRuntime(runtime), [runtime]);
  const quoteSelectionAvailable = Boolean(onQuoteSelection && annotationPath);
  const annotationAvailable = Boolean(
    annotationPath &&
      scope &&
      annotationRuntime,
  );
  const selection = useTextSelection(
    bodyRef,
    {
      enabled: Boolean(quoteSelectionAvailable || annotationAvailable) && kind !== "image" && !previewLoading && !error,
      excludeSelector: FILE_PREVIEW_SELECTION_EXCLUDE_SELECTOR,
    },
  );
  const [annotations, setAnnotations] = useState<WorkspaceFileAnnotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [annotationReloadId, setAnnotationReloadId] = useState(0);
  const [fileAnnotationDraft, setFileAnnotationDraft] = useState("");
  const [selectionDraft, setSelectionDraft] = useState<SelectionAnnotationDraft | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState("");
  const [annotationMutationError, setAnnotationMutationError] = useState<string | null>(null);
  const [annotationMutatingId, setAnnotationMutatingId] = useState<string | null>(null);
  const [sourceSelection, setSourceSelection] = useState<SourceSelection | null>(null);
  const [lineRevealRequest, setLineRevealRequest] = useState<SourceLineRevealRequest | null>(null);
  const [previewRevealRequest, setPreviewRevealRequest] = useState<PreviewAnnotationRevealRequest | null>(null);
  const [annotationPanelOpen, setAnnotationPanelOpen] = useState(false);
  const [annotationPanelClosing, setAnnotationPanelClosing] = useState(false);
  const [activeAnnotationPopover, setActiveAnnotationPopover] = useState<AnnotationPopoverState | null>(null);
  const [focusedAnnotationId, setFocusedAnnotationId] = useState<string | null>(null);
  const [flashAnnotationId, setFlashAnnotationId] = useState<string | null>(null);
  const [selectionDraftPopover, setSelectionDraftPopover] = useState<AnnotationDraftPopoverState | null>(null);
  const annotationPanelCloseTimerRef = useRef<number | null>(null);
  const annotationFlashTimerRef = useRef<number | null>(null);
  const annotationPopoverFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const themeObserver = new MutationObserver(() => setTheme(getTheme()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => themeObserver.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (annotationPanelCloseTimerRef.current !== null) {
        window.clearTimeout(annotationPanelCloseTimerRef.current);
      }
      if (annotationFlashTimerRef.current !== null) {
        window.clearTimeout(annotationFlashTimerRef.current);
      }
      if (annotationPopoverFrameRef.current !== null) {
        window.cancelAnimationFrame(annotationPopoverFrameRef.current);
      }
    };
  }, []);

  const hasAnchoredAnnotationPopover = Boolean(activeAnnotationPopover || selectionDraftPopover);
  useEffect(() => {
    if (!hasAnchoredAnnotationPopover) {
      return;
    }
    const updatePopoverPositions = () => {
      if (annotationPopoverFrameRef.current !== null) {
        return;
      }
      annotationPopoverFrameRef.current = window.requestAnimationFrame(() => {
        annotationPopoverFrameRef.current = null;
        setActiveAnnotationPopover((current) => (current ? repositionPopoverState(current) : current));
        setSelectionDraftPopover((current) => (current ? repositionPopoverState(current) : current));
      });
    };
    window.addEventListener("scroll", updatePopoverPositions, true);
    window.addEventListener("resize", updatePopoverPositions);
    return () => {
      window.removeEventListener("scroll", updatePopoverPositions, true);
      window.removeEventListener("resize", updatePopoverPositions);
      if (annotationPopoverFrameRef.current !== null) {
        window.cancelAnimationFrame(annotationPopoverFrameRef.current);
        annotationPopoverFrameRef.current = null;
      }
    };
  }, [hasAnchoredAnnotationPopover]);

  useEffect(() => {
    if (!activeAnnotationPopover) {
      return;
    }
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(FILE_PREVIEW_ANNOTATION_POPOVER_SELECTOR)) {
        return;
      }
      setActiveAnnotationPopover(null);
      setFocusedAnnotationId(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
  }, [activeAnnotationPopover]);

  const openAnnotationPanel = useCallback(() => {
    if (annotationPanelCloseTimerRef.current !== null) {
      window.clearTimeout(annotationPanelCloseTimerRef.current);
      annotationPanelCloseTimerRef.current = null;
    }
    setActiveAnnotationPopover(null);
    setSelectionDraft(null);
    setSelectionDraftPopover(null);
    setAnnotationPanelClosing(false);
    setAnnotationPanelOpen(true);
  }, []);

  const closeAnnotationPanel = useCallback(() => {
    if (!annotationPanelOpen || annotationPanelClosing) {
      return;
    }
    setAnnotationPanelClosing(true);
    annotationPanelCloseTimerRef.current = window.setTimeout(() => {
      annotationPanelCloseTimerRef.current = null;
      setAnnotationPanelOpen(false);
      setAnnotationPanelClosing(false);
    }, ANNOTATION_PANEL_EXIT_MS);
  }, [annotationPanelClosing, annotationPanelOpen]);

  const toggleAnnotationPanel = useCallback(() => {
    if (annotationPanelOpen && !annotationPanelClosing) {
      closeAnnotationPanel();
      return;
    }
    openAnnotationPanel();
  }, [annotationPanelClosing, annotationPanelOpen, closeAnnotationPanel, openAnnotationPanel]);

  useEffect(() => {
    let active = true;
    setError(null);
    setMedia(null);
    setCopyState("idle");
    setViewMode(defaultViewMode(request));
    setSplitMode(false);

    if (request.type === "content") {
      setContent(request.content || "");
      setLoading(false);
      return () => {
        active = false;
      };
    }

    if (request.type === "diff") {
      setContent(request.diff || "暂无 diff");
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setContent("");
    if (!scope || !runtime) {
      setError("工作区预览运行时未就绪");
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    const loader =
      kind === "image"
        ? runtime.workspace.readMedia(scope, request.path).then((response) => {
            if (active) {
              setMedia(response);
            }
          })
        : runtime.workspace.readFile(scope, request.path).then((response) => {
            if (active) {
              setContent(response.content);
            }
          });

    void loader
      .catch((reason) => {
        if (active) {
          setError(errorMessage(reason));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [kind, scope, runtime, request]);

  useEffect(() => {
    setSourceSelection(null);
    setSelectionDraft(null);
    setEditingAnnotationId(null);
    setEditingComment("");
    setActiveAnnotationPopover(null);
    setSelectionDraftPopover(null);
    setAnnotationMutationError(null);
    if (annotationPanelCloseTimerRef.current !== null) {
      window.clearTimeout(annotationPanelCloseTimerRef.current);
      annotationPanelCloseTimerRef.current = null;
    }
    setAnnotationPanelOpen(false);
    setAnnotationPanelClosing(false);
  }, [annotationPath]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setAnnotations([]);
    setAnnotationError(null);

    if (!annotationAvailable || !annotationPath || !scope || !annotationRuntime) {
      setAnnotationsLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    setAnnotationsLoading(true);
    void annotationRuntime
      .listAnnotations(scope, annotationPath, { signal: controller.signal })
      .then((records) => {
        if (active) {
          setAnnotations(records);
        }
      })
      .catch((reason) => {
        if (active && !isAbortError(reason)) {
          setAnnotationError(errorMessage(reason));
        }
      })
      .finally(() => {
        if (active) {
          setAnnotationsLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [annotationAvailable, annotationPath, annotationReloadId, annotationRuntime, scope]);

  const title = previewTitle(request);
  const canPreview = kind === "markdown" || kind === "html" || kind === "mermaid";
  const canRenderPreview = canPreview || kind === "diff";
  const canSplit = kind === "markdown" || kind === "html";
  const sourceLabel = previewSourceLabel(request);
  const markdownComponents = useMemo(
    () => ({
      pre: PreviewMarkdownCodeBlock,
      table: MarkdownTable,
      img: (props: Parameters<typeof MarkdownImage>[0]) => (
        <MarkdownImage {...props} workspaceScope={scope} runtime={runtime} sourcePath={sourceLabel} />
      ),
    }),
    [scope, runtime, sourceLabel],
  );
  const markdownContent = previewContent || "文件为空";
  const selectionAnnotations = useMemo(
    () =>
      annotations.filter(
        (annotation) =>
          annotation.anchor_type === "selection" && Boolean((annotation.selected_text || "").trim()),
      ),
    [annotations],
  );
  const activeAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.id === activeAnnotationPopover?.annotationId) ?? null,
    [activeAnnotationPopover?.annotationId, annotations],
  );
  const activeAnnotationId = activeAnnotationPopover?.annotationId ?? focusedAnnotationId;

  const activateAnnotation = useCallback(
    (annotation: WorkspaceFileAnnotation, position: AnnotationClientPosition) => {
      closeAnnotationPanel();
      setSelectionDraft(null);
      setSelectionDraftPopover(null);
      setAnnotationMutationError(null);
      setFocusedAnnotationId(annotation.id);
      setActiveAnnotationPopover({
        annotationId: annotation.id,
        ...createPopoverState(
          {
            x: position.clientX,
            y: position.clientY,
            width: position.width ?? 0,
            height: position.height ?? 0,
          },
          position.anchorElement ?? bodyRef.current,
          bodyRef.current,
        ),
      });
    },
    [closeAnnotationPanel],
  );

  const currentContentHash = useMemo(
    () => (annotationPath && kind !== "image" && previewContent ? hashText(previewContent) : null),
    [annotationPath, kind, previewContent],
  );

  const createFileAnnotation = useCallback(async () => {
    const comment = fileAnnotationDraft.trim();
    if (!annotationAvailable || !annotationPath || !scope || !annotationRuntime || !comment) {
      return;
    }
    setAnnotationMutationError(null);
    setAnnotationMutatingId("create-file");
    try {
      const created = await annotationRuntime.createAnnotation(scope, {
        path: annotationPath,
        anchor_type: "file",
        comment,
        content_hash: currentContentHash,
      });
      setAnnotations((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setFileAnnotationDraft("");
    } catch (reason) {
      setAnnotationMutationError(errorMessage(reason));
    } finally {
      setAnnotationMutatingId(null);
    }
  }, [annotationAvailable, annotationPath, annotationRuntime, currentContentHash, fileAnnotationDraft, scope]);

  const startSelectionAnnotation = useCallback(
    (selectedText: string) => {
      if (!selectedText.trim()) {
        return;
      }
      const preciseSelection = resolveSourceSelection(formatSource(previewContent, kind), sourceSelection, selectedText);
      const selectionPosition = selection.selectionPosition;
      setSelectionDraft({
        selectedText,
        comment: "",
        lineStart: preciseSelection?.lineStart ?? null,
        lineEnd: preciseSelection?.lineEnd ?? null,
        columnStart: preciseSelection?.columnStart ?? null,
        columnEnd: preciseSelection?.columnEnd ?? null,
      });
      setSelectionDraftPopover({
        ...createPopoverState(
          {
            x: selectionPosition?.x ?? window.innerWidth / 2,
            y: selectionPosition?.y ?? 120,
            width: selectionPosition?.width ?? 0,
            height: selectionPosition?.height ?? 0,
          },
          currentSelectionElement(bodyRef.current),
          bodyRef.current,
        ),
      });
      setActiveAnnotationPopover(null);
      closeAnnotationPanel();
      setAnnotationMutationError(null);
    },
    [closeAnnotationPanel, kind, previewContent, selection.selectionPosition, sourceSelection],
  );

  const quotePreviewSelection = useCallback(
    (selectedText: string) => {
      const text = selectedText.trim();
      if (!text || !annotationPath) {
        return;
      }
      const preciseSelection = resolveSourceSelection(formatSource(previewContent, kind), sourceSelection, text);
      onQuoteSelection?.({
        path: annotationPath,
        selectedText: text,
        lineStart: preciseSelection?.lineStart ?? null,
        lineEnd: preciseSelection?.lineEnd ?? null,
      });
    },
    [annotationPath, kind, onQuoteSelection, previewContent, sourceSelection],
  );

  const createSelectionAnnotation = useCallback(async () => {
    const comment = selectionDraft?.comment.trim() ?? "";
    if (!annotationAvailable || !annotationPath || !scope || !annotationRuntime || !selectionDraft || !comment) {
      return;
    }
    setAnnotationMutationError(null);
    setAnnotationMutatingId("create-selection");
    try {
      const created = await annotationRuntime.createAnnotation(scope, {
        path: annotationPath,
        anchor_type: "selection",
        comment,
        selected_text: selectionDraft.selectedText,
        line_start: selectionDraft.lineStart,
        line_end: selectionDraft.lineEnd,
        column_start: selectionDraft.columnStart,
        column_end: selectionDraft.columnEnd,
        content_hash: currentContentHash,
      });
      setAnnotations((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectionDraft(null);
      setSelectionDraftPopover(null);
    } catch (reason) {
      setAnnotationMutationError(errorMessage(reason));
    } finally {
      setAnnotationMutatingId(null);
    }
  }, [annotationAvailable, annotationPath, annotationRuntime, currentContentHash, scope, selectionDraft]);

  const beginEditAnnotation = useCallback((annotation: WorkspaceFileAnnotation) => {
    setEditingAnnotationId(annotation.id);
    setEditingComment(annotation.comment);
    setAnnotationMutationError(null);
  }, []);

  const saveAnnotationComment = useCallback(
    async (annotation: WorkspaceFileAnnotation, value: string) => {
      const comment = value.trim();
      if (!annotationAvailable || !scope || !annotationRuntime || !comment) {
        return false;
      }
      setAnnotationMutationError(null);
      setAnnotationMutatingId(`edit:${annotation.id}`);
      try {
        const updated = await annotationRuntime.updateAnnotation(scope, annotation.id, { comment });
        setAnnotations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        return true;
      } catch (reason) {
        setAnnotationMutationError(errorMessage(reason));
        return false;
      } finally {
        setAnnotationMutatingId(null);
      }
    },
    [annotationAvailable, annotationRuntime, scope],
  );

  const saveAnnotationEdit = useCallback(
    async (annotation: WorkspaceFileAnnotation) => {
      const saved = await saveAnnotationComment(annotation, editingComment);
      if (saved) {
        setEditingAnnotationId(null);
        setEditingComment("");
      }
    },
    [editingComment, saveAnnotationComment],
  );

  const deleteAnnotation = useCallback(
    async (annotation: WorkspaceFileAnnotation) => {
      if (!annotationAvailable || !scope || !annotationRuntime) {
        return;
      }
      setAnnotationMutationError(null);
      setAnnotationMutatingId(`delete:${annotation.id}`);
      try {
        await annotationRuntime.deleteAnnotation(scope, annotation.id);
        setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
        setActiveAnnotationPopover((current) =>
          current?.annotationId === annotation.id ? null : current,
        );
        setFocusedAnnotationId((current) => (current === annotation.id ? null : current));
      } catch (reason) {
        setAnnotationMutationError(errorMessage(reason));
      } finally {
        setAnnotationMutatingId(null);
      }
    },
    [annotationAvailable, annotationRuntime, scope],
  );

  const startChatFromAnnotation = useCallback(
    (annotation: WorkspaceFileAnnotation) => {
      onStartChatFromAnnotation?.({
        path: annotation.path,
        comment: annotation.comment,
        selectedText: annotation.selected_text,
        lineStart: annotation.line_start,
        lineEnd: annotation.line_end,
      });
    },
    [onStartChatFromAnnotation],
  );

  const flashAnnotation = useCallback((annotationId: string) => {
    if (annotationFlashTimerRef.current !== null) {
      window.clearTimeout(annotationFlashTimerRef.current);
    }
    setFlashAnnotationId(null);
    window.requestAnimationFrame(() => {
      setFlashAnnotationId(annotationId);
      annotationFlashTimerRef.current = window.setTimeout(() => {
        annotationFlashTimerRef.current = null;
        setFlashAnnotationId((current) => (current === annotationId ? null : current));
      }, ANNOTATION_FLASH_MS);
    });
  }, []);

  const revealAnnotationLine = useCallback(
    (annotation: WorkspaceFileAnnotation) => {
      const line = annotationSourceLine(formatSource(previewContent, kind), annotation);
      if (!line) {
        return false;
      }
      setViewMode("source");
      setLineRevealRequest((current) => ({
        requestId: (current?.requestId ?? 0) + 1,
        line,
      }));
      setFocusedAnnotationId(annotation.id);
      flashAnnotation(annotation.id);
      return true;
    },
    [flashAnnotation, kind, previewContent],
  );

  const scrollAnnotationElementIntoView = useCallback(
    (annotation: WorkspaceFileAnnotation, element: HTMLElement) => {
      element.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "smooth" });
      setFocusedAnnotationId(annotation.id);
      flashAnnotation(annotation.id);
    },
    [flashAnnotation],
  );

  const revealAnnotation = useCallback(
    (annotation: WorkspaceFileAnnotation) => {
      if (!annotation.selected_text) {
        return;
      }
      setFocusedAnnotationId(annotation.id);
      const existingElement = findAnnotationElement(bodyRef.current, annotation.id);
      if (existingElement) {
        scrollAnnotationElementIntoView(annotation, existingElement);
        return;
      }
      if (viewMode === "source" || splitMode) {
        revealAnnotationLine(annotation);
        return;
      }
      if (kind === "markdown") {
        setViewMode("preview");
        setSplitMode(false);
        setPreviewRevealRequest((current) => ({
          requestId: (current?.requestId ?? 0) + 1,
          annotationId: annotation.id,
        }));
        return;
      }
      revealAnnotationLine(annotation);
    },
    [kind, revealAnnotationLine, scrollAnnotationElementIntoView, splitMode, viewMode],
  );

  useEffect(() => {
    if (!previewRevealRequest) {
      return;
    }
    const annotation = annotations.find((item) => item.id === previewRevealRequest.annotationId);
    if (!annotation) {
      return;
    }
    const element = findAnnotationElement(bodyRef.current, annotation.id);
    if (element) {
      scrollAnnotationElementIntoView(annotation, element);
      return;
    }
    revealAnnotationLine(annotation);
  }, [annotations, previewRevealRequest, revealAnnotationLine, scrollAnnotationElementIntoView]);

  const renderSourcePane = () => (
    <SourceViewer
      content={formatSource(previewContent, kind)}
      kind={kind}
      language={sourceLanguage(request, kind)}
      theme={theme}
      annotations={selectionAnnotations}
      activeAnnotationId={activeAnnotationId}
      flashAnnotationId={flashAnnotationId}
      revealLineRequest={lineRevealRequest}
      onAnnotationActivate={activateAnnotation}
      onSelectionChange={setSourceSelection}
    />
  );

  const renderPreviewPane = () => {
    if (kind === "mermaid") {
      return <NativeMermaidPreview code={previewContent || ""} />;
    }

    if (kind === "markdown") {
      return (
        <AnnotatedMarkdownPreview
          annotations={selectionAnnotations}
          activeAnnotationId={activeAnnotationId}
          flashAnnotationId={flashAnnotationId}
          components={markdownComponents}
          content={markdownContent}
          onAnnotationActivate={activateAnnotation}
        />
      );
    }

    if (kind === "html") {
      const htmlDocument = previewContent || "<p>文件为空</p>";
      return (
        <div className={styles.htmlPane}>
          <iframe
            key={hashText(htmlDocument)}
            className={styles.htmlFrame}
            title="HTML 文件预览"
            sandbox=""
            srcDoc={htmlDocument}
          />
        </div>
      );
    }

    if (kind === "diff") {
      return <DiffPreview diff={previewContent || "暂无 diff"} />;
    }

    return renderSourcePane();
  };

  const renderBodyContent = () => {
    if (kind === "image") {
      return <ImagePreview media={media} title={title} sourceLabel={sourceLabel} />;
    }

    if (splitMode && canSplit) {
      return (
        <div className={styles.splitPane} data-testid="preview-split-pane">
          <section className={styles.splitPanel} aria-label="源码内容">
            <div className={styles.splitPanelHeader}>
              <Code2 size={13} />
              <span>源码</span>
            </div>
            <div className={styles.splitPanelBody}>{renderSourcePane()}</div>
          </section>
          <section className={styles.splitPanel} aria-label="渲染预览">
            <div className={styles.splitPanelHeader}>
              <Eye size={13} />
              <span>预览</span>
            </div>
            <div className={styles.splitPanelBody}>{renderPreviewPane()}</div>
          </section>
        </div>
      );
    }

    if (viewMode === "preview" && canRenderPreview) {
      return renderPreviewPane();
    }

    return renderSourcePane();
  };

  const renderActions = () => (
    <div className={styles.actions}>
      {canPreview ? (
        <div className={styles.segmented} aria-label="预览模式">
          <button
            type="button"
            aria-pressed={viewMode === "preview" && !splitMode}
            onClick={() => {
              setViewMode("preview");
              setSplitMode(false);
            }}
          >
            <Eye size={13} />
            <span>预览</span>
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "source" && !splitMode}
            onClick={() => {
              setViewMode("source");
              setSplitMode(false);
            }}
          >
            <Code2 size={13} />
            <span>源码</span>
          </button>
          {canSplit ? (
            <button
              type="button"
              aria-pressed={splitMode}
              title="分屏预览"
              onClick={() => {
                setViewMode("preview");
                setSplitMode((current) => !current);
              }}
            >
              <Columns2 size={13} />
              <span>分屏</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {annotationPath ? (
        <button
          className={styles.annotationToggle}
          type="button"
          aria-label={`文件批注 ${annotations.length}`}
          aria-pressed={annotationPanelOpen && !annotationPanelClosing}
          title="文件批注"
          onClick={toggleAnnotationPanel}
        >
          <MessageSquareText size={13} />
          <span>批注</span>
          <span className={styles.annotationToggleCount}>{annotations.length}</span>
        </button>
      ) : null}
      <button
        className={styles.iconButton}
        type="button"
        aria-label="复制预览内容"
        disabled={previewLoading || Boolean(error) || !previewContent}
        onClick={handleCopy}
      >
        {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
      </button>
      {onClose ? (
        <button
          className={styles.iconButton}
          type="button"
          aria-label="关闭文件预览"
          title="关闭文件预览"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );

  const handleCopy = async () => {
    try {
      await copyText(previewContent);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section className={styles.preview} data-chrome={chrome} aria-label="文件预览">
      {showPreviewTabs && !panelChrome ? (
        <div className={styles.tabs} role="tablist" aria-label="预览历史">
          {previewEntries.map((entry) => {
            const active = entry.id === activePreviewId;
            return (
              <div key={entry.id} className={styles.tab} data-active={active ? "true" : "false"}>
                <button
                  className={styles.tabMain}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={entry.sourceLabel}
                  onClick={() => previewContext?.switchPreview(entry.id)}
                >
                  <span className={styles.tabTitle}>{entry.title}</span>
                </button>
                <button
                  className={styles.tabClose}
                  type="button"
                  aria-label={`关闭预览 ${entry.title}`}
                  title={`关闭预览 ${entry.title}`}
                  onClick={() => previewContext?.closePreviewEntry(entry.id)}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <header
        className={styles.header}
        data-chrome={chrome}
        data-breadcrumbs-hidden={hideBreadcrumbs ? "true" : "false"}
      >
        {!hideBreadcrumbs ? (
          <div className={styles.breadcrumbGroup}>
            <PathBreadcrumbs path={sourceLabel} rootLabel={breadcrumbRootLabel} />
          </div>
        ) : null}
        {renderActions()}
      </header>

      {previewLoading ? <p className={styles.muted}>正在读取文件</p> : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {!previewLoading && !error ? (
        <div className={styles.body} data-chrome={chrome} aria-label="预览内容" ref={bodyRef}>
          {renderBodyContent()}
          {quoteSelectionAvailable || annotationAvailable ? (
            <SelectionToolbar
              selectedText={selection.selectedText}
              position={selection.selectionPosition}
              onQuote={quoteSelectionAvailable ? quotePreviewSelection : undefined}
              onAnnotate={annotationAvailable ? startSelectionAnnotation : undefined}
              onClear={selection.clearSelection}
            />
          ) : null}
          {activeAnnotation && activeAnnotationPopover ? (
            <AnnotationPopover
              annotation={activeAnnotation}
              canStartChat={Boolean(onStartChatFromAnnotation)}
              mutatingId={annotationMutatingId}
              position={activeAnnotationPopover}
              onClose={() => {
                setActiveAnnotationPopover(null);
                setFocusedAnnotationId(null);
              }}
              onDelete={deleteAnnotation}
              onSave={saveAnnotationComment}
              onStartChat={startChatFromAnnotation}
            />
          ) : null}
          {selectionDraft && selectionDraftPopover ? (
            <AnnotationDraftPopover
              draft={selectionDraft}
              error={annotationMutationError}
              mutating={annotationMutatingId === "create-selection"}
              position={selectionDraftPopover}
              onCancel={() => {
                setSelectionDraft(null);
                setSelectionDraftPopover(null);
                setAnnotationMutationError(null);
              }}
              onChange={setSelectionDraft}
              onCreate={createSelectionAnnotation}
            />
          ) : null}
          {annotationPath && (annotationPanelOpen || annotationPanelClosing) ? (
            <AnnotationPanel
              closing={annotationPanelClosing}
              annotations={annotations}
              loading={annotationsLoading}
              error={annotationError}
              unavailable={!annotationAvailable}
              fileDraft={fileAnnotationDraft}
              editingAnnotationId={editingAnnotationId}
              editingComment={editingComment}
              mutationError={annotationMutationError}
              mutatingId={annotationMutatingId}
              currentContentHash={currentContentHash}
              activeAnnotationId={activeAnnotationId}
              canStartChat={Boolean(onStartChatFromAnnotation)}
              onFileDraftChange={setFileAnnotationDraft}
              onCreateFileAnnotation={createFileAnnotation}
              onBeginEdit={beginEditAnnotation}
              onEditingCommentChange={setEditingComment}
              onSaveEdit={saveAnnotationEdit}
              onCancelEdit={() => {
                setEditingAnnotationId(null);
                setEditingComment("");
              }}
              onDelete={deleteAnnotation}
              onStartChat={startChatFromAnnotation}
              onReveal={revealAnnotation}
              onRetry={() => setAnnotationReloadId((current) => current + 1)}
              onClose={closeAnnotationPanel}
            />
          ) : null}
        </div>
      ) : null}
      {copyState === "failed" && !panelChrome ? <span className={styles.copyError}>复制失败</span> : null}
      {copyState === "copied" && !panelChrome ? <span className={styles.copyHint}>已复制</span> : null}
    </section>
  );
}

type PreviewKind = "markdown" | "html" | "diff" | "json" | "code" | "text" | "mermaid" | "image";
const HIGHLIGHT_MAX_CHARS = 120_000;
const HIGHLIGHT_MAX_LINES = 2_000;
const ANNOTATION_PANEL_EXIT_MS = 160;
const ANNOTATION_FLASH_ITERATIONS = 1;
const ANNOTATION_FLASH_INTERVAL_MS = 700;
const ANNOTATION_FLASH_MS = ANNOTATION_FLASH_ITERATIONS * ANNOTATION_FLASH_INTERVAL_MS;
const ANNOTATION_POPOVER_ESTIMATED_HEIGHT = 190;
const ANNOTATION_POPOVER_GAP = 10;
const FILE_PREVIEW_SELECTION_EXCLUDE_SELECTOR = "[data-file-preview-selection-excluded='true']";
const FILE_PREVIEW_ANNOTATION_POPOVER_SELECTOR = "[data-file-preview-annotation-popover='true']";

interface SelectionAnnotationDraft {
  selectedText: string;
  comment: string;
  lineStart: number | null;
  lineEnd: number | null;
  columnStart: number | null;
  columnEnd: number | null;
}

interface SourceSelection {
  selectedText: string;
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
}

interface SourceLineRevealRequest {
  requestId: number;
  line: number;
}

interface PreviewAnnotationRevealRequest {
  requestId: number;
  annotationId: string;
}

interface AnnotationPopoverState {
  annotationId: string;
  anchor: AnnotationPopoverAnchor;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AnnotationDraftPopoverState {
  anchor: AnnotationPopoverAnchor;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AnnotationClientPosition {
  clientX: number;
  clientY: number;
  width?: number;
  height?: number;
  anchorElement?: HTMLElement | null;
}

interface AnnotationPopoverAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
  scrollElement: HTMLElement | null;
  scrollLeft: number;
  scrollTop: number;
  windowScrollX: number;
  windowScrollY: number;
}

interface AnnotationPanelProps {
  closing: boolean;
  annotations: WorkspaceFileAnnotation[];
  loading: boolean;
  error: string | null;
  unavailable: boolean;
  fileDraft: string;
  editingAnnotationId: string | null;
  editingComment: string;
  mutationError: string | null;
  mutatingId: string | null;
  currentContentHash: string | null;
  activeAnnotationId: string | null;
  canStartChat: boolean;
  onFileDraftChange: (value: string) => void;
  onCreateFileAnnotation: () => void;
  onBeginEdit: (annotation: WorkspaceFileAnnotation) => void;
  onEditingCommentChange: (value: string) => void;
  onSaveEdit: (annotation: WorkspaceFileAnnotation) => void;
  onCancelEdit: () => void;
  onDelete: (annotation: WorkspaceFileAnnotation) => void;
  onStartChat: (annotation: WorkspaceFileAnnotation) => void;
  onReveal: (annotation: WorkspaceFileAnnotation) => void;
  onRetry: () => void;
  onClose: () => void;
}

function AnnotationPopover({
  annotation,
  canStartChat,
  mutatingId,
  position,
  onClose,
  onDelete,
  onSave,
  onStartChat,
}: {
  annotation: WorkspaceFileAnnotation;
  canStartChat: boolean;
  mutatingId: string | null;
  position: AnnotationPopoverState;
  onClose: () => void;
  onDelete: (annotation: WorkspaceFileAnnotation) => void;
  onSave: (annotation: WorkspaceFileAnnotation, value: string) => Promise<boolean>;
  onStartChat: (annotation: WorkspaceFileAnnotation) => void;
}) {
  const [comment, setComment] = useState(annotation.comment);
  useEffect(() => {
    setComment(annotation.comment);
  }, [annotation.comment, annotation.id]);
  const saving = mutatingId === `edit:${annotation.id}`;
  const deleting = mutatingId === `delete:${annotation.id}`;
  const changed = comment.trim() !== annotation.comment.trim();
  const placement = popoverPlacement(position);
  const style = popoverStyle(position, placement);

  return createPortal(
    <aside
      className={styles.annotationPopover}
      data-file-preview-annotation-popover="true"
      data-file-preview-selection-excluded="true"
      data-placement={placement}
      style={style}
      aria-label="选区批注"
    >
      <header className={styles.annotationPopoverHeader}>
        <span className={styles.annotationBadge}>{formatAnnotationBadge(annotation)}</span>
      </header>
      {annotation.selected_text ? (
        <blockquote className={styles.annotationPopoverQuote}>{annotation.selected_text}</blockquote>
      ) : null}
      <textarea
        className={styles.annotationPopoverTextarea}
        value={comment}
        rows={3}
        aria-label="编辑批注"
        onChange={(event) => setComment(event.currentTarget.value)}
      />
      <div className={styles.annotationPopoverActions} data-layout="annotation">
        <div className={styles.annotationPopoverActionGroup}>
          <button
            type="button"
            aria-label="删除批注"
            disabled={deleting}
            onClick={() => {
              onDelete(annotation);
              onClose();
            }}
          >
            <Trash2 size={12} />
            <span>删除</span>
          </button>
        </div>
        <div className={styles.annotationPopoverActionGroup}>
          <button
            type="button"
            disabled={!comment.trim() || !changed || saving}
            aria-label="保存批注"
            onClick={async () => {
              const saved = await onSave(annotation, comment);
              if (saved) {
                onClose();
              }
            }}
          >
            <Check size={12} />
            <span>{saving ? "保存中" : "保存"}</span>
          </button>
          <button
            type="button"
            disabled={!canStartChat}
            aria-label="基于此批注发起对话"
            onClick={() => {
              onStartChat(annotation);
              onClose();
            }}
          >
            <Send size={12} />
            <span>对话</span>
          </button>
          <button type="button" aria-label="关闭批注浮窗" onClick={onClose}>
            <X size={12} />
            <span>关闭</span>
          </button>
        </div>
      </div>
    </aside>,
    document.body,
  );
}

function AnnotationDraftPopover({
  draft,
  error,
  mutating,
  position,
  onCancel,
  onChange,
  onCreate,
}: {
  draft: SelectionAnnotationDraft;
  error: string | null;
  mutating: boolean;
  position: AnnotationDraftPopoverState;
  onCancel: () => void;
  onChange: (draft: SelectionAnnotationDraft) => void;
  onCreate: () => void;
}) {
  const placement = popoverPlacement(position);
  const style = popoverStyle(position, placement);

  return createPortal(
    <aside
      className={styles.annotationPopover}
      data-file-preview-selection-excluded="true"
      data-placement={placement}
      style={style}
      aria-label="新增选区批注"
    >
      <header className={styles.annotationPopoverHeader}>
        <span className={styles.annotationBadge}>{formatAnnotationBadge(draft)}</span>
        <button type="button" aria-label="取消选区批注" onClick={onCancel}>
          <X size={12} />
        </button>
      </header>
      <blockquote className={styles.annotationPopoverQuote}>{draft.selectedText}</blockquote>
      <textarea
        className={styles.annotationPopoverTextarea}
        value={draft.comment}
        rows={3}
        placeholder="添加选区批注"
        aria-label="添加选区批注"
        autoFocus
        onChange={(event) => onChange({ ...draft, comment: event.currentTarget.value })}
      />
      {error ? <p className={styles.annotationPopoverError}>{error}</p> : null}
      <div className={styles.annotationPopoverActions}>
        <button type="button" disabled={!draft.comment.trim() || mutating} onClick={onCreate}>
          <MessageSquarePlus size={12} />
          <span>{mutating ? "保存中" : "保存批注"}</span>
        </button>
        <button type="button" data-variant="ghost" onClick={onCancel}>
          取消
        </button>
      </div>
    </aside>,
    document.body,
  );
}

type AnnotationPopoverPlacement = "top" | "bottom";

function createPopoverState(
  position: Pick<AnnotationPopoverState, "x" | "y" | "width" | "height">,
  anchorElement: HTMLElement | null,
  boundary: HTMLElement | null,
): Pick<AnnotationPopoverState, "anchor" | "x" | "y" | "width" | "height"> {
  const scrollElement = nearestScrollableAncestor(anchorElement, boundary);
  return {
    ...position,
    anchor: {
      ...position,
      scrollElement,
      scrollLeft: scrollElement?.scrollLeft ?? 0,
      scrollTop: scrollElement?.scrollTop ?? 0,
      windowScrollX: window.scrollX,
      windowScrollY: window.scrollY,
    },
  };
}

function repositionPopoverState<T extends Pick<AnnotationPopoverState, "anchor" | "x" | "y" | "width" | "height">>(
  state: T,
): T {
  const next = resolvePopoverPosition(state.anchor);
  if (
    Math.abs(next.x - state.x) < 0.5 &&
    Math.abs(next.y - state.y) < 0.5 &&
    next.width === state.width &&
    next.height === state.height
  ) {
    return state;
  }
  return { ...state, ...next };
}

function resolvePopoverPosition(anchor: AnnotationPopoverAnchor): Pick<AnnotationPopoverState, "x" | "y" | "width" | "height"> {
  const scrollDeltaX = anchor.scrollElement ? anchor.scrollLeft - anchor.scrollElement.scrollLeft : 0;
  const scrollDeltaY = anchor.scrollElement ? anchor.scrollTop - anchor.scrollElement.scrollTop : 0;
  return {
    x: anchor.x + scrollDeltaX + anchor.windowScrollX - window.scrollX,
    y: anchor.y + scrollDeltaY + anchor.windowScrollY - window.scrollY,
    width: anchor.width,
    height: anchor.height,
  };
}

function currentSelectionElement(boundary: HTMLElement | null): HTMLElement | null {
  const selection = window.getSelection();
  if (!boundary || !selection || selection.rangeCount === 0) {
    return boundary;
  }
  const node = selection.getRangeAt(0).commonAncestorContainer;
  const element = node instanceof HTMLElement ? node : node.parentElement;
  return element && boundary.contains(element) ? element : boundary;
}

function nearestScrollableAncestor(element: HTMLElement | null, boundary: HTMLElement | null): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current) {
    if (isScrollableElement(current)) {
      return current;
    }
    if (current === boundary) {
      return null;
    }
    current = current.parentElement;
  }
  return null;
}

function isScrollableElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
  return /(auto|scroll|overlay)/.test(overflow) && (
    element.scrollHeight > element.clientHeight ||
    element.scrollWidth > element.clientWidth
  );
}

function popoverPlacement(position: Pick<AnnotationPopoverState, "y">): AnnotationPopoverPlacement {
  return position.y > ANNOTATION_POPOVER_ESTIMATED_HEIGHT + ANNOTATION_POPOVER_GAP ? "top" : "bottom";
}

function popoverStyle(
  position: Pick<AnnotationPopoverState, "x" | "y" | "height">,
  placement: AnnotationPopoverPlacement,
): CSSProperties {
  const top =
    placement === "bottom"
      ? position.y + Math.max(0, position.height) + ANNOTATION_POPOVER_GAP
      : position.y - ANNOTATION_POPOVER_GAP;
  return {
    left: `clamp(168px, ${position.x}px, calc(100vw - 168px))`,
    top: `${Math.max(ANNOTATION_POPOVER_GAP, top)}px`,
  };
}

function AnnotationPanel({
  closing,
  annotations,
  loading,
  error,
  unavailable,
  fileDraft,
  editingAnnotationId,
  editingComment,
  mutationError,
  mutatingId,
  currentContentHash,
  activeAnnotationId,
  canStartChat,
  onFileDraftChange,
  onCreateFileAnnotation,
  onBeginEdit,
  onEditingCommentChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onStartChat,
  onReveal,
  onRetry,
  onClose,
}: AnnotationPanelProps) {
  const creatingFile = mutatingId === "create-file";
  const [fileComposerOpen, setFileComposerOpen] = useState(false);

  return (
    <aside
      className={styles.annotationPanel}
      data-file-preview-selection-excluded="true"
      data-state={closing ? "closing" : "open"}
      aria-label="文件批注"
    >
      <header className={styles.annotationHeader}>
        <span className={styles.annotationTitle}>
          <MessageSquareText size={14} />
          <span>批注</span>
        </span>
        <div className={styles.annotationHeaderActions}>
          <span className={styles.annotationCount}>{annotations.length}</span>
          <button type="button" className={styles.annotationClose} aria-label="关闭批注面板" onClick={onClose}>
            <X size={13} />
          </button>
        </div>
      </header>

      {unavailable ? <p className={styles.annotationMuted}>当前预览缺少工作区上下文，无法保存批注。</p> : null}

      {loading ? <p className={styles.annotationMuted}>正在加载批注</p> : null}
      {error ? (
        <div className={styles.annotationError} role="alert">
          <span>{error}</span>
          <button type="button" onClick={onRetry}>
            重试
          </button>
        </div>
      ) : null}
      {mutationError ? <div className={styles.annotationError}>{mutationError}</div> : null}

      {!loading && !error && annotations.length === 0 ? (
        <p className={styles.annotationEmpty}>暂无批注</p>
      ) : null}

      <div className={styles.annotationList}>
        {annotations.map((annotation) => {
          const editing = editingAnnotationId === annotation.id;
          const stale = isAnnotationStale(annotation, currentContentHash);
          return (
            <article
              className={styles.annotationItem}
              key={annotation.id}
              data-active={activeAnnotationId === annotation.id ? "true" : "false"}
              data-stale={stale ? "true" : "false"}
            >
              <div className={styles.annotationItemHeader}>
                {annotation.line_start ? (
                  <button
                    className={styles.annotationBadgeButton}
                    type="button"
                    title="定位到源码行"
                    onClick={() => onReveal(annotation)}
                  >
                    {formatAnnotationBadge(annotation)}
                  </button>
                ) : (
                  <span className={styles.annotationBadge}>{formatAnnotationBadge(annotation)}</span>
                )}
                {stale ? <span className={styles.annotationStale}>内容可能已变化</span> : null}
              </div>

              {annotation.selected_text ? (
                <blockquote className={styles.annotationQuote}>{annotation.selected_text}</blockquote>
              ) : null}

              {editing ? (
                <div className={styles.annotationEdit}>
                  <textarea
                    value={editingComment}
                    rows={3}
                    aria-label="编辑批注"
                    onChange={(event) => onEditingCommentChange(event.currentTarget.value)}
                  />
                  <div className={styles.annotationComposerActions}>
                    <button
                      type="button"
                      disabled={!editingComment.trim() || mutatingId === `edit:${annotation.id}`}
                      onClick={() => onSaveEdit(annotation)}
                    >
                      保存
                    </button>
                    <button type="button" data-variant="ghost" onClick={onCancelEdit}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <p className={styles.annotationComment}>{annotation.comment}</p>
              )}

              <div className={styles.annotationActions}>
                {annotation.selected_text ? (
                  <button
                    type="button"
                    title="定位批注片段"
                    aria-label="定位批注片段"
                    onClick={() => onReveal(annotation)}
                  >
                    <Target size={13} />
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!canStartChat}
                  title="发起对话"
                  aria-label="基于此批注发起对话"
                  onClick={() => onStartChat(annotation)}
                >
                  <Send size={13} />
                </button>
                <button
                  type="button"
                  title="编辑批注"
                  aria-label="编辑批注"
                  onClick={() => onBeginEdit(annotation)}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  title="删除批注"
                  aria-label="删除批注"
                  disabled={mutatingId === `delete:${annotation.id}`}
                  onClick={() => onDelete(annotation)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {!unavailable && !fileComposerOpen ? (
        <button type="button" className={styles.annotationAddButton} onClick={() => setFileComposerOpen(true)}>
          <MessageSquarePlus size={13} />
          <span>添加文件批注</span>
        </button>
      ) : null}

      {!unavailable && fileComposerOpen ? (
        <div className={styles.annotationComposer}>
          <textarea
            value={fileDraft}
            rows={2}
            placeholder="添加文件级批注"
            aria-label="添加文件级批注"
            onChange={(event) => onFileDraftChange(event.currentTarget.value)}
          />
          <div className={styles.annotationComposerActions}>
            <button
              type="button"
              disabled={!fileDraft.trim() || creatingFile}
              onClick={() => {
                onCreateFileAnnotation();
                setFileComposerOpen(false);
              }}
            >
              <MessageSquarePlus size={13} />
              <span>{creatingFile ? "保存中" : "添加文件批注"}</span>
            </button>
            <button type="button" data-variant="ghost" onClick={() => setFileComposerOpen(false)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function matchingSourceSelection(sourceSelection: SourceSelection | null, selectedText: string): SourceSelection | null {
  if (!sourceSelection) {
    return null;
  }
  return normalizeSelectionText(sourceSelection.selectedText) === normalizeSelectionText(selectedText)
    ? sourceSelection
    : null;
}

function resolveSourceSelection(
  source: string,
  sourceSelection: SourceSelection | null,
  selectedText: string,
): SourceSelection | null {
  return matchingSourceSelection(sourceSelection, selectedText) ?? sourceSelectionFromText(source, selectedText);
}

function sourceSelectionFromText(source: string, selectedText: string): SourceSelection | null {
  const range = sourceTextRange(source, selectedText);
  return range ? sourceSelectionFromRange(source, selectedText, range) : null;
}

function normalizeSelectionText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatAnnotationBadge(
  annotation: Pick<WorkspaceFileAnnotation, "anchor_type" | "line_start" | "line_end"> | SelectionAnnotationDraft,
): string {
  if ("anchor_type" in annotation && annotation.anchor_type === "file") {
    return "文件";
  }
  if ("lineStart" in annotation && annotation.lineStart && annotation.lineEnd) {
    return annotation.lineStart === annotation.lineEnd
      ? `L${annotation.lineStart}`
      : `L${annotation.lineStart}-L${annotation.lineEnd}`;
  }
  if ("line_start" in annotation && annotation.line_start && annotation.line_end) {
    return annotation.line_start === annotation.line_end
      ? `L${annotation.line_start}`
      : `L${annotation.line_start}-L${annotation.line_end}`;
  }
  return "选区";
}

function isAnnotationStale(annotation: WorkspaceFileAnnotation, currentContentHash: string | null): boolean {
  return Boolean(annotation.content_hash && currentContentHash && annotation.content_hash !== currentContentHash);
}

function findAnnotationElement(container: HTMLElement | null, annotationId: string): HTMLElement | null {
  if (!container) {
    return null;
  }
  const elements = container.querySelectorAll<HTMLElement>("[data-preview-annotation-id], [data-file-annotation-id]");
  return Array.from(elements).find(
    (element) =>
      element.dataset.previewAnnotationId === annotationId ||
      element.dataset.fileAnnotationId === annotationId,
  ) ?? null;
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}

function AnnotatedMarkdownPreview({
  annotations,
  activeAnnotationId,
  flashAnnotationId,
  components,
  content,
  onAnnotationActivate,
}: {
  annotations: WorkspaceFileAnnotation[];
  activeAnnotationId: string | null;
  flashAnnotationId: string | null;
  components: Components;
  content: string;
  onAnnotationActivate: (annotation: WorkspaceFileAnnotation, position: AnnotationClientPosition) => void;
}) {
  const annotationPlugin = useMemo(
    () => createMarkdownAnnotationPlugin(annotations, activeAnnotationId, flashAnnotationId),
    [activeAnnotationId, annotations, flashAnnotationId],
  );
  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      const marker = target?.closest<HTMLElement>("[data-preview-annotation-id]");
      const annotationId = marker?.dataset.previewAnnotationId;
      if (!annotationId) {
        return;
      }
      const annotation = annotations.find((item) => item.id === annotationId);
      if (!annotation) {
        return;
      }
      const rect = marker.getBoundingClientRect();
      event.preventDefault();
      event.stopPropagation();
      onAnnotationActivate(annotation, {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top,
        width: rect.width,
        height: rect.height,
        anchorElement: marker,
      });
    },
    [annotations, onAnnotationActivate],
  );

  return (
    <div className={styles.markdownPane} onClick={handleClick}>
      <div className="codex-markdown">
        <ReactMarkdown
          remarkPlugins={markdownRemarkPlugins}
          rehypePlugins={[...markdownRehypePlugins, annotationPlugin]}
          components={components}
        >
          {normalizeMarkdownContent(content)}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function createMarkdownAnnotationPlugin(
  annotations: WorkspaceFileAnnotation[],
  activeAnnotationId: string | null,
  flashAnnotationId: string | null,
) {
  const candidates = annotations
    .map((annotation) => ({
      annotation,
      texts: annotationCandidateTexts(annotation.selected_text || ""),
    }))
    .filter((candidate) => candidate.texts.length > 0);

  return () => (tree: unknown) => {
    if (!candidates.length) {
      return;
    }
    annotateMarkdownTextNodes(tree, candidates, activeAnnotationId, flashAnnotationId);
  };
}

function annotateMarkdownTextNodes(
  tree: unknown,
  candidates: MarkdownAnnotationCandidate[],
  activeAnnotationId: string | null,
  flashAnnotationId: string | null,
): void {
  if (!isMarkdownAnnotationNode(tree)) {
    return;
  }
  const refs: MarkdownTextRef[] = [];
  collectMarkdownTextRefs(tree, null, refs);
  const index = markdownTextIndex(refs);
  if (!index.text) {
    return;
  }
  const used = new Set<string>();
  const occupied: Array<{ start: number; end: number }> = [];
  const rangesByRef = new Map<number, MarkdownTextAnnotationRange[]>();
  for (const candidate of candidates) {
    if (used.has(candidate.annotation.id)) {
      continue;
    }
    const match = firstAvailableCandidateMatch(index.text, candidate.texts, occupied);
    if (!match) {
      continue;
    }
    addMarkdownAnnotationRanges(index.map, match.start, match.end, candidate, rangesByRef);
    occupied.push(match);
    used.add(candidate.annotation.id);
  }
  applyMarkdownAnnotationRanges(refs, rangesByRef, activeAnnotationId, flashAnnotationId);
}

function annotationCandidateTexts(selectedText: string): string[] {
  const candidates = [
    normalizeSelectionText(selectedText),
    sourceNormalizedText(selectedText, "markdown"),
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

function collectMarkdownTextRefs(
  node: MarkdownAnnotationNode,
  block: MarkdownAnnotationNode | null,
  refs: MarkdownTextRef[],
): void {
  if (!isMarkdownAnnotationNode(node)) {
    return;
  }
  if (!Array.isArray(node.children) || shouldSkipMarkdownAnnotationNode(node)) {
    return;
  }
  const currentBlock = markdownBlockTagNames.has(node.tagName || "") ? node : block;
  node.children.forEach((child, index) => {
    if (isMarkdownTextNode(child)) {
      refs.push({ block: currentBlock, index, node: child, parent: node });
      return;
    }
    if (isMarkdownAnnotationNode(child)) {
      collectMarkdownTextRefs(child, currentBlock, refs);
    }
  });
}

function markdownTextIndex(refs: MarkdownTextRef[]): MarkdownNormalizedIndex {
  const parts: string[] = [];
  const map: MarkdownNormalizedMapEntry[] = [];
  let previousRef: MarkdownTextRef | null = null;
  refs.forEach((ref, refIndex) => {
    if (previousRef && previousRef.block !== ref.block) {
      appendNormalizedSeparator(parts, map);
    }
    appendNormalizedText(ref.node.value, refIndex, parts, map);
    previousRef = ref;
  });
  return { map, text: parts.join("") };
}

function appendNormalizedText(
  value: string,
  refIndex: number,
  parts: string[],
  map: MarkdownNormalizedMapEntry[],
): void {
  for (let offset = 0; offset < value.length; offset += 1) {
    const char = value[offset];
    if (/\s/.test(char)) {
      if (parts.length > 0 && parts[parts.length - 1] !== " ") {
        parts.push(" ");
        map.push({ offset, refIndex });
      }
      continue;
    }
    parts.push(char);
    map.push({ offset, refIndex });
  }
}

function appendNormalizedSeparator(parts: string[], map: MarkdownNormalizedMapEntry[]): void {
  if (parts.length > 0 && parts[parts.length - 1] !== " ") {
    parts.push(" ");
    map.push(null);
  }
}

function firstAvailableNormalizedMatch(
  text: string,
  candidate: string,
  occupied: Array<{ start: number; end: number }>,
): number {
  let cursor = 0;
  while (cursor < text.length) {
    const index = text.indexOf(candidate, cursor);
    if (index < 0) {
      return -1;
    }
    const end = index + candidate.length;
    if (!occupied.some((range) => index < range.end && end > range.start)) {
      return index;
    }
    cursor = index + 1;
  }
  return -1;
}

function firstAvailableCandidateMatch(
  text: string,
  candidates: string[],
  occupied: Array<{ start: number; end: number }>,
): { end: number; start: number } | null {
  for (const candidate of candidates) {
    const start = firstAvailableNormalizedMatch(text, candidate, occupied);
    if (start >= 0) {
      return { start, end: start + candidate.length };
    }
  }
  return null;
}

function addMarkdownAnnotationRanges(
  map: MarkdownNormalizedMapEntry[],
  start: number,
  end: number,
  candidate: MarkdownAnnotationCandidate,
  rangesByRef: Map<number, MarkdownTextAnnotationRange[]>,
): void {
  const ranges = new Map<number, { end: number; start: number }>();
  for (let index = start; index < end; index += 1) {
    const entry = map[index];
    if (!entry) {
      continue;
    }
    const current = ranges.get(entry.refIndex);
    if (!current) {
      ranges.set(entry.refIndex, { start: entry.offset, end: entry.offset + 1 });
      continue;
    }
    current.start = Math.min(current.start, entry.offset);
    current.end = Math.max(current.end, entry.offset + 1);
  }
  for (const [refIndex, range] of ranges) {
    const list = rangesByRef.get(refIndex) ?? [];
    list.push({ ...range, candidate });
    rangesByRef.set(refIndex, list);
  }
}

function applyMarkdownAnnotationRanges(
  refs: MarkdownTextRef[],
  rangesByRef: Map<number, MarkdownTextAnnotationRange[]>,
  activeAnnotationId: string | null,
  flashAnnotationId: string | null,
): void {
  const replacementsByParent = new Map<MarkdownAnnotationNode, Array<{ index: number; nodes: unknown[] }>>();
  for (const [refIndex, ranges] of rangesByRef) {
    const ref = refs[refIndex];
    const nodes = splitMarkdownTextNodeByRanges(ref.node.value, ranges, activeAnnotationId, flashAnnotationId);
    if (nodes.length === 1 && nodes[0] === ref.node) {
      continue;
    }
    const replacements = replacementsByParent.get(ref.parent) ?? [];
    replacements.push({ index: ref.index, nodes });
    replacementsByParent.set(ref.parent, replacements);
  }
  for (const [parent, replacements] of replacementsByParent) {
    if (!Array.isArray(parent.children)) {
      continue;
    }
    replacements
      .sort((left, right) => right.index - left.index)
      .forEach((replacement) => {
        parent.children?.splice(replacement.index, 1, ...replacement.nodes);
      });
  }
}

function splitMarkdownTextNodeByRanges(
  value: string,
  ranges: MarkdownTextAnnotationRange[],
  activeAnnotationId: string | null,
  flashAnnotationId: string | null,
): unknown[] {
  const nodes: unknown[] = [];
  let cursor = 0;
  const orderedRanges = ranges
    .map((range) => ({
      ...range,
      end: Math.max(0, Math.min(value.length, range.end)),
      start: Math.max(0, Math.min(value.length, range.start)),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || right.end - left.end);
  for (const range of orderedRanges) {
    if (range.start < cursor) {
      continue;
    }
    if (range.start > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, range.start) });
    }
    nodes.push(markdownAnnotationMarkNode(
      value.slice(range.start, range.end),
      range.candidate,
      activeAnnotationId,
      flashAnnotationId,
    ));
    cursor = range.end;
  }
  if (!nodes.length) {
    return [{ type: "text", value }];
  }
  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) });
  }
  return nodes;
}

function markdownAnnotationMarkNode(
  value: string,
  candidate: MarkdownAnnotationCandidate,
  activeAnnotationId: string | null,
  flashAnnotationId: string | null,
): unknown {
  return {
    type: "element",
    tagName: "mark",
    properties: {
      className: [styles.previewAnnotationMark],
      "data-preview-annotation-id": candidate.annotation.id,
      "data-active": activeAnnotationId === candidate.annotation.id ? "true" : "false",
      "data-flash": flashAnnotationId === candidate.annotation.id ? "true" : "false",
      title: candidate.annotation.comment,
    },
    children: [{ type: "text", value }],
  };
}

const markdownBlockTagNames = new Set([
  "blockquote",
  "dd",
  "div",
  "dt",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "section",
  "td",
  "th",
  "ul",
]);

type MarkdownNormalizedMapEntry = { offset: number; refIndex: number } | null;

interface MarkdownNormalizedIndex {
  map: MarkdownNormalizedMapEntry[];
  text: string;
}

interface MarkdownTextAnnotationRange {
  candidate: MarkdownAnnotationCandidate;
  end: number;
  start: number;
}

interface MarkdownTextRef {
  block: MarkdownAnnotationNode | null;
  index: number;
  node: { type: "text"; value: string };
  parent: MarkdownAnnotationNode;
}

function sourceTextRange(source: string, selectedText: string): Pick<AnnotationTextRange, "from" | "to"> | null {
  const exactText = selectedText.trim();
  if (!exactText) {
    return null;
  }
  const index = source.indexOf(exactText);
  if (index >= 0) {
    return { from: index, to: index + exactText.length };
  }
  return sourceNormalizedRange(source, exactText, "plain") ?? sourceNormalizedRange(source, exactText, "markdown");
}

function sourceSelectionFromRange(
  source: string,
  selectedText: string,
  range: Pick<AnnotationTextRange, "from" | "to">,
): SourceSelection {
  const start = sourceLineColumnAtOffset(source, range.from);
  const end = sourceLineColumnAtOffset(source, range.to);
  return {
    selectedText,
    lineStart: start.line,
    lineEnd: end.line,
    columnStart: start.column,
    columnEnd: end.column,
  };
}

type SourceNormalizeMode = "plain" | "markdown";

function sourceNormalizedRange(
  source: string,
  selectedText: string,
  mode: SourceNormalizeMode,
): Pick<AnnotationTextRange, "from" | "to"> | null {
  const candidate = sourceNormalizedText(selectedText, mode);
  if (!candidate) {
    return null;
  }
  const index = sourceNormalizedIndex(source, mode);
  const matchStart = index.text.indexOf(candidate);
  if (matchStart < 0) {
    return null;
  }
  const from = index.map[matchStart];
  const to = (index.map[matchStart + candidate.length - 1] ?? from) + 1;
  return normalizeOffsetRange(source, from, to);
}

function sourceNormalizedText(text: string, mode: SourceNormalizeMode): string {
  return sourceNormalizedIndex(text, mode).text.trim();
}

function sourceNormalizedIndex(source: string, mode: SourceNormalizeMode): SourceNormalizedIndex {
  const parts: string[] = [];
  const map: number[] = [];
  for (let offset = 0; offset < source.length; offset += 1) {
    const char = source[offset];
    if (mode === "markdown" && shouldSkipMarkdownSourceSyntax(source, offset)) {
      continue;
    }
    if (/\s/.test(char)) {
      if (parts.length > 0 && parts[parts.length - 1] !== " ") {
        parts.push(" ");
        map.push(offset);
      }
      continue;
    }
    parts.push(char);
    map.push(offset);
  }
  return { map, text: parts.join("") };
}

function sourceLineColumnAtOffset(source: string, offset: number): { column: number; line: number } {
  const starts = lineStartOffsets(source);
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

function shouldSkipMarkdownSourceSyntax(source: string, offset: number): boolean {
  const char = source[offset];
  if (char === "*" || char === "_" || char === "~" || char === "`" || char === "[" || char === "]") {
    return true;
  }
  if (char === "#" && isHeadingMarkdownMarker(source, offset)) {
    return true;
  }
  if (char === ">" && isLinePrefixMarkdownMarker(source, offset)) {
    return true;
  }
  if ((char === "-" || char === "+") && isLinePrefixMarkdownMarker(source, offset) && source[offset + 1] === " ") {
    return true;
  }
  return false;
}

function isLinePrefixMarkdownMarker(source: string, offset: number): boolean {
  for (let index = offset - 1; index >= 0; index -= 1) {
    const char = source[index];
    if (char === "\n") {
      return true;
    }
    if (char !== " " && char !== "\t") {
      return false;
    }
  }
  return true;
}

function isHeadingMarkdownMarker(source: string, offset: number): boolean {
  let lineStart = offset;
  while (lineStart > 0 && source[lineStart - 1] !== "\n") {
    lineStart -= 1;
  }
  let cursor = lineStart;
  while (source[cursor] === " " || source[cursor] === "\t") {
    cursor += 1;
  }
  if (offset < cursor) {
    return false;
  }
  while (source[cursor] === "#") {
    cursor += 1;
  }
  return offset < cursor && (source[cursor] === " " || source[cursor] === "\t");
}

interface SourceNormalizedIndex {
  map: number[];
  text: string;
}

function shouldSkipMarkdownAnnotationNode(node: MarkdownAnnotationNode): boolean {
  return node.tagName === "code" || node.tagName === "pre" || node.tagName === "script" || node.tagName === "style";
}

function isMarkdownTextNode(node: unknown): node is { type: "text"; value: string } {
  return isMarkdownAnnotationNode(node) && node.type === "text" && typeof node.value === "string";
}

function isMarkdownAnnotationNode(node: unknown): node is MarkdownAnnotationNode {
  return Boolean(node && typeof node === "object");
}

interface MarkdownAnnotationCandidate {
  annotation: WorkspaceFileAnnotation;
  texts: string[];
}

interface MarkdownAnnotationNode {
  type?: string;
  tagName?: string;
  value?: string;
  children?: unknown[];
}

function PreviewMarkdownCodeBlock({ children }: { children?: ReactNode }) {
  const codeChild = getCodeChild(children);
  const language = codeBlockLanguage(codeChild?.props?.className);
  const text = stripTrailingNewline(extractMarkdownText(codeChild?.props?.children ?? children));

  if (language === "mermaid") {
    return <NativeMermaidPreview code={text} layout="document" />;
  }

  return (
    <pre className={styles.markdownCodeBlock} data-language={language}>
      <code>{text || " "}</code>
    </pre>
  );
}

function SourceViewer({
  content,
  kind,
  language,
  theme,
  annotations = [],
  activeAnnotationId = null,
  flashAnnotationId = null,
  revealLineRequest,
  onAnnotationActivate,
  onSelectionChange,
}: {
  content: string;
  kind: PreviewKind;
  language: string;
  theme: "light" | "dark";
  annotations?: WorkspaceFileAnnotation[];
  activeAnnotationId?: string | null;
  flashAnnotationId?: string | null;
  revealLineRequest?: SourceLineRevealRequest | null;
  onAnnotationActivate?: (annotation: WorkspaceFileAnnotation, position: AnnotationClientPosition) => void;
  onSelectionChange?: (selection: SourceSelection | null) => void;
}) {
  const source = content || "文件为空";
  const lineCount = useMemo(() => countLines(source), [source]);
  const canHighlight =
    kind === "code" ||
    kind === "markdown" ||
    kind === "html" ||
    kind === "json" ||
    kind === "mermaid" ||
    kind === "diff";
  const shouldHighlight =
    canHighlight && source.length <= HIGHLIGHT_MAX_CHARS && lineCount <= HIGHLIGHT_MAX_LINES;

  useEffect(() => {
    if (!shouldHighlight) {
      onSelectionChange?.(null);
    }
  }, [onSelectionChange, shouldHighlight]);

  if (shouldHighlight) {
    return (
      <div className={styles.sourceViewer} data-renderer="codemirror" data-testid="file-source-viewer">
        <CodeMirrorSourceView
          language={language}
          source={source}
          theme={theme}
          annotations={annotations}
          activeAnnotationId={activeAnnotationId}
          flashAnnotationId={flashAnnotationId}
          revealLineRequest={revealLineRequest}
          onAnnotationActivate={onAnnotationActivate}
          onSelectionChange={onSelectionChange}
        />
      </div>
    );
  }

  return (
    <div className={styles.sourceViewer} data-renderer="plain" data-testid="file-source-viewer">
      <pre className={styles.sourceLineNumbers} aria-hidden="true">
        {lineNumbersText(lineCount)}
      </pre>
      <pre className={styles.sourcePlainCode}>
        <code>{source}</code>
      </pre>
    </div>
  );
}

function CodeMirrorSourceView({
  language,
  source,
  theme,
  annotations,
  activeAnnotationId,
  flashAnnotationId,
  revealLineRequest,
  onAnnotationActivate,
  onSelectionChange,
}: {
  language: string;
  source: string;
  theme: "light" | "dark";
  annotations: WorkspaceFileAnnotation[];
  activeAnnotationId: string | null;
  flashAnnotationId: string | null;
  revealLineRequest?: SourceLineRevealRequest | null;
  onAnnotationActivate?: (annotation: WorkspaceFileAnnotation, position: AnnotationClientPosition) => void;
  onSelectionChange?: (selection: SourceSelection | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const selectionExtension = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet) {
          return;
        }
        const range = update.state.selection.main;
        if (range.empty) {
          onSelectionChange?.(null);
          return;
        }
        const from = Math.min(range.from, range.to);
        const to = Math.max(range.from, range.to);
        const selectedText = update.state.doc.sliceString(from, to);
        if (!selectedText.trim()) {
          onSelectionChange?.(null);
          return;
        }
        const startLine = update.state.doc.lineAt(from);
        const endLine = update.state.doc.lineAt(to);
        onSelectionChange?.({
          selectedText,
          lineStart: startLine.number,
          lineEnd: endLine.number,
          columnStart: from - startLine.from + 1,
          columnEnd: Math.max(1, to - endLine.from + 1),
        });
      }),
    [onSelectionChange],
  );
  const extensions = useMemo(
    () => [
      ...codeMirrorExtensions(language, theme),
      codeMirrorAnnotationExtension(source, annotations, activeAnnotationId, flashAnnotationId, onAnnotationActivate),
      selectionExtension,
    ],
    [activeAnnotationId, annotations, flashAnnotationId, language, onAnnotationActivate, selectionExtension, source, theme],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: source,
        extensions,
      }),
    });
    viewRef.current = view;

    return () => {
      if (viewRef.current === view) {
        viewRef.current = null;
      }
      onSelectionChange?.(null);
      view.destroy();
    };
  }, [extensions, onSelectionChange, source]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !revealLineRequest) {
      return;
    }
    const lineNumber = Math.max(1, Math.min(revealLineRequest.line, view.state.doc.lines));
    const position = view.state.doc.line(lineNumber).from;
    smoothScrollCodeMirrorPositionIntoView(view, position);
  }, [revealLineRequest]);

  return <div ref={hostRef} className={styles.codeMirrorHost} />;
}

function smoothScrollCodeMirrorPositionIntoView(view: EditorView, position: number): void {
  view.requestMeasure({
    read() {
      const line = view.lineBlockAt(position);
      const scroll = view.scrollDOM;
      return Math.max(0, line.top - (scroll.clientHeight - line.height) / 2);
    },
    write(top) {
      view.scrollDOM.scrollTo({ top, behavior: "smooth" });
    },
  });
}

function codeMirrorAnnotationExtension(
  source: string,
  annotations: WorkspaceFileAnnotation[],
  activeAnnotationId: string | null,
  flashAnnotationId: string | null,
  onAnnotationActivate?: (annotation: WorkspaceFileAnnotation, position: AnnotationClientPosition) => void,
): Extension {
  const decorationRanges = annotationDecorationRanges(source, annotations).map(({ annotation, from, to }) =>
    Decoration.mark({
      class: "cm-fileAnnotationMark",
      attributes: {
        "data-file-annotation-id": annotation.id,
        "data-active": activeAnnotationId === annotation.id ? "true" : "false",
        "data-flash": flashAnnotationId === annotation.id ? "true" : "false",
        title: annotation.comment,
      },
    }).range(from, to),
  );
  const decorations: DecorationSet = Decoration.set(decorationRanges, true);

  return [
    EditorView.decorations.of(decorations),
    EditorView.domEventHandlers({
      click(event) {
        const target = event.target instanceof Element ? event.target : null;
        const marker = target?.closest<HTMLElement>("[data-file-annotation-id]");
        const annotationId = marker?.dataset.fileAnnotationId;
        if (!annotationId) {
          return false;
        }
        const annotation = annotations.find((item) => item.id === annotationId);
        if (!annotation) {
          return false;
        }
        const rect = marker.getBoundingClientRect();
        event.preventDefault();
        event.stopPropagation();
        onAnnotationActivate?.(annotation, {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top,
          width: rect.width,
          height: rect.height,
          anchorElement: marker,
        });
        return true;
      },
    }),
  ];
}

function annotationDecorationRanges(source: string, annotations: WorkspaceFileAnnotation[]): AnnotationTextRange[] {
  return annotations
    .map((annotation) => {
      const range = annotationSourceRange(source, annotation);
      return range ? { annotation, ...range } : null;
    })
    .filter((range): range is AnnotationTextRange => Boolean(range));
}

interface AnnotationTextRange {
  annotation: WorkspaceFileAnnotation;
  from: number;
  to: number;
}

function annotationSourceRange(
  source: string,
  annotation: WorkspaceFileAnnotation,
): Pick<AnnotationTextRange, "from" | "to"> | null {
  const lineStart = annotation.line_start;
  const lineEnd = annotation.line_end;
  const columnStart = annotation.column_start;
  const columnEnd = annotation.column_end;
  if (
    positiveInteger(lineStart) &&
    positiveInteger(lineEnd) &&
    positiveInteger(columnStart) &&
    positiveInteger(columnEnd)
  ) {
    const range = lineColumnRangeToOffsets(source, lineStart, lineEnd, columnStart, columnEnd);
    if (range) {
      return range;
    }
  }

  const selectedText = annotation.selected_text?.trim();
  if (selectedText) {
    const range = sourceTextRange(source, selectedText);
    if (range) {
      return range;
    }
  }

  if (positiveInteger(lineStart) && positiveInteger(lineEnd)) {
    const range = lineRangeToOffsets(source, lineStart, lineEnd);
    if (range) {
      return range;
    }
  }

  return null;
}

function annotationSourceLine(source: string, annotation: WorkspaceFileAnnotation): number | null {
  if (positiveInteger(annotation.line_start)) {
    return annotation.line_start;
  }
  const selectedText = annotation.selected_text?.trim();
  if (!selectedText) {
    return null;
  }
  const range = sourceTextRange(source, selectedText);
  if (!range) {
    return null;
  }
  return source.slice(0, range.from).split("\n").length;
}

function lineColumnRangeToOffsets(
  source: string,
  lineStart: number,
  lineEnd: number,
  columnStart: number,
  columnEnd: number,
): Pick<AnnotationTextRange, "from" | "to"> | null {
  const starts = lineStartOffsets(source);
  if (lineStart < 1 || lineEnd < lineStart || lineStart > starts.length || lineEnd > starts.length) {
    return null;
  }
  const startOffset = starts[lineStart - 1] + Math.max(0, columnStart - 1);
  const endOffset = starts[lineEnd - 1] + Math.max(0, columnEnd - 1);
  return normalizeOffsetRange(source, startOffset, endOffset);
}

function lineRangeToOffsets(
  source: string,
  lineStart: number,
  lineEnd: number,
): Pick<AnnotationTextRange, "from" | "to"> | null {
  const starts = lineStartOffsets(source);
  if (lineStart < 1 || lineEnd < lineStart || lineStart > starts.length || lineEnd > starts.length) {
    return null;
  }
  const from = starts[lineStart - 1];
  const nextLineStart = starts[lineEnd] ?? source.length;
  return normalizeOffsetRange(source, from, nextLineStart);
}

function lineStartOffsets(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n" && index + 1 < source.length) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function normalizeOffsetRange(
  source: string,
  from: number,
  to: number,
): Pick<AnnotationTextRange, "from" | "to"> | null {
  const start = Math.max(0, Math.min(from, source.length));
  const end = Math.max(start, Math.min(to, source.length));
  return end > start ? { from: start, to: end } : null;
}

function positiveInteger(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function codeMirrorExtensions(language: string, theme: "light" | "dark"): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    foldGutter({ markerDOM: codeMirrorFoldMarker }),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    search({ top: true }),
    highlightSelectionMatches(),
    EditorState.readOnly.of(true),
    EditorView.lineWrapping,
    keymap.of([...searchKeymap, ...foldKeymap]),
    codeMirrorTheme(theme),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    syntaxHighlighting(codeMirrorHighlightStyle, { fallback: true }),
    codeMirrorLanguage(language),
  ].filter(Boolean) as Extension[];
}

function codeMirrorFoldMarker(open: boolean): HTMLElement {
  const marker = document.createElement("span");
  marker.className = "cm-fileFoldMarker";
  marker.dataset.open = open ? "true" : "false";
  marker.setAttribute("aria-label", open ? "折叠代码块" : "展开代码块");
  marker.setAttribute("role", "button");
  marker.title = open ? "折叠代码块" : "展开代码块";
  return marker;
}

function codeMirrorLanguage(language: string): Extension | null {
  switch (language) {
    case "javascript":
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "typescript":
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "json":
      return jsonLanguage();
    case "python":
    case "py":
      return python();
    case "html":
    case "htm":
      return htmlLanguage();
    case "xml":
      return xml();
    case "css":
    case "scss":
    case "sass":
    case "less":
      return cssLanguage();
    case "markdown":
    case "md":
    case "mdx":
      return markdownLanguage();
    case "sql":
      return sql();
    case "yaml":
    case "yml":
      return yaml();
    default:
      return null;
  }
}

function codeMirrorTheme(theme: "light" | "dark"): Extension {
  const dark = theme === "dark";
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        minHeight: "180px",
        backgroundColor: "var(--color-bg-elevated)",
        color: "var(--color-text-primary)",
        fontSize: "12px",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: "1.55",
      },
      ".cm-content": {
        minHeight: "100%",
        padding: "10px 0 14px",
      },
      ".cm-line": {
        padding: "0 14px",
      },
      ".cm-gutters": {
        backgroundColor: "var(--color-bg-elevated)",
        borderRight: "1px solid color-mix(in srgb, var(--color-border-subtle) 72%, transparent)",
        color: "var(--color-text-tertiary)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        minWidth: "46px",
        padding: "0 12px 0 8px",
      },
      ".cm-foldGutter": {
        minWidth: "30px",
      },
      ".cm-foldGutter .cm-gutterElement": {
        display: "flex",
        minWidth: "30px",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 4px",
      },
      ".cm-fileFoldMarker": {
        display: "inline-grid",
        width: "18px",
        height: "18px",
        placeItems: "center",
        borderRadius: "var(--radius-xs)",
        color: "var(--color-text-tertiary)",
        cursor: "pointer",
        animation: "filePreviewFoldMarkerIn 160ms var(--motion-ease-out) both",
        transition:
          "background-color var(--motion-fast) var(--motion-ease-standard), color var(--motion-fast) var(--motion-ease-standard), transform var(--motion-fast) var(--motion-ease-standard)",
      },
      ".cm-fileFoldMarker::before": {
        width: "6px",
        height: "6px",
        borderRight: "1.6px solid currentColor",
        borderBottom: "1.6px solid currentColor",
        content: "''",
        transform: "rotate(45deg) translate(-1px, -1px)",
        transition: "transform 180ms var(--motion-ease-standard)",
      },
      ".cm-fileFoldMarker[data-open='false']::before": {
        transform: "rotate(-45deg) translate(-1px, 1px)",
      },
      ".cm-fileFoldMarker:hover": {
        backgroundColor: "var(--surface-hover)",
        color: "var(--color-text-primary)",
      },
      ".cm-fileFoldMarker:active": {
        transform: "scale(0.92)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
        color: "var(--color-text-secondary)",
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in srgb, var(--color-accent) 5%, transparent)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "color-mix(in srgb, var(--color-accent) 26%, transparent)",
      },
      ".cm-searchMatch": {
        backgroundColor: "color-mix(in srgb, var(--color-warning) 22%, transparent)",
        outline: "1px solid color-mix(in srgb, var(--color-warning) 42%, transparent)",
      },
      ".cm-searchMatch-selected": {
        backgroundColor: "color-mix(in srgb, var(--color-accent) 28%, transparent)",
      },
      ".cm-fileAnnotationMark": {
        borderBottom: "1px solid color-mix(in srgb, var(--color-warning) 70%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--color-warning) 18%, transparent)",
        borderRadius: "3px",
        cursor: "pointer",
        transition:
          "background-color var(--motion-fast) var(--motion-ease-standard), box-shadow var(--motion-fast) var(--motion-ease-standard)",
      },
      ".cm-fileAnnotationMark:hover, .cm-fileAnnotationMark[data-active='true']": {
        backgroundColor: "color-mix(in srgb, var(--color-warning) 30%, transparent)",
        boxShadow: "0 0 0 1px color-mix(in srgb, var(--color-warning) 46%, transparent)",
      },
      ".cm-fileAnnotationMark[data-flash='true']": {
        animation: "annotationMarkFlash 700ms var(--motion-ease-out) 1 both",
        backgroundColor: "color-mix(in srgb, var(--color-warning) 52%, transparent)",
        boxShadow: "0 0 0 3px color-mix(in srgb, var(--color-warning) 22%, transparent)",
      },
      ".cm-foldPlaceholder": {
        display: "inline-flex",
        minWidth: "22px",
        height: "18px",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-xs)",
        backgroundColor: "var(--surface-muted)",
        color: "var(--color-text-tertiary)",
        fontSize: "12px",
        lineHeight: "1",
        padding: "0 6px",
        animation: "filePreviewFoldPlaceholderIn 180ms var(--motion-ease-out) both",
        transition:
          "background-color var(--motion-fast) var(--motion-ease-standard), border-color var(--motion-fast) var(--motion-ease-standard), color var(--motion-fast) var(--motion-ease-standard)",
      },
      ".cm-foldPlaceholder:hover": {
        borderColor: "color-mix(in srgb, var(--color-accent) 46%, var(--color-border-subtle))",
        backgroundColor: "color-mix(in srgb, var(--color-accent) 8%, var(--surface-muted))",
        color: "var(--color-text-primary)",
      },
      "@keyframes filePreviewFoldMarkerIn": {
        from: {
          opacity: "0",
          transform: "scale(0.82)",
        },
        to: {
          opacity: "1",
          transform: "scale(1)",
        },
      },
      "@keyframes filePreviewFoldPlaceholderIn": {
        from: {
          opacity: "0",
          transform: "translateY(-2px)",
        },
        to: {
          opacity: "1",
          transform: "translateY(0)",
        },
      },
      ".cm-tooltip": {
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-sm)",
        backgroundColor: "var(--color-bg-elevated)",
        color: "var(--color-text-primary)",
        boxShadow: "var(--shadow-popover)",
      },
      ".cm-panel": {
        borderColor: "var(--color-border-subtle)",
        backgroundColor: "var(--color-bg-elevated)",
        color: "var(--color-text-primary)",
      },
      ".cm-panel input": {
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-xs)",
        backgroundColor: "var(--surface-bg)",
        color: "var(--color-text-primary)",
        font: "inherit",
      },
      ".cm-button": {
        border: "0",
        borderRadius: "var(--radius-xs)",
        backgroundImage: "none",
        backgroundColor: "var(--surface-muted)",
        color: "var(--color-text-secondary)",
      },
    },
    { dark },
  );
}

const codeMirrorHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#7c3aed", fontWeight: "600" },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: "#2563eb" },
  { tag: [tags.number, tags.integer, tags.float], color: "#0f766e" },
  { tag: [tags.string, tags.special(tags.string)], color: "#15803d" },
  { tag: tags.regexp, color: "#be123c" },
  { tag: [tags.comment, tags.docComment], color: "var(--color-text-tertiary)", fontStyle: "italic" },
  { tag: tags.variableName, color: "var(--color-text-primary)" },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], color: "#0f68a8" },
  { tag: [tags.className, tags.typeName, tags.namespace], color: "#b45309" },
  { tag: [tags.propertyName, tags.attributeName], color: "#1d4ed8" },
  { tag: tags.operator, color: "#9333ea" },
  { tag: [tags.punctuation, tags.bracket, tags.squareBracket, tags.paren, tags.brace], color: "var(--color-text-tertiary)" },
  { tag: [tags.heading, tags.strong], fontWeight: "700", color: "var(--color-text-primary)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "var(--color-accent)", textDecoration: "underline" },
]);

function PathBreadcrumbs({ path, rootLabel }: { path: string; rootLabel?: string }) {
  const pathSegments = path.split(/[\\/]/).filter(Boolean);
  const rootSegment = rootLabel ? fileName(rootLabel) : "";
  const displaySegments = [
    ...(rootSegment && pathSegments[0] !== rootSegment ? [rootSegment] : []),
    ...(pathSegments.length > 0 ? pathSegments : [path]),
  ];
  return (
    <div className={styles.pathBreadcrumbs} title={displaySegments.join(" / ")}>
      {displaySegments.map((segment, index) => (
        <span className={styles.pathSegment} key={`${index}-${segment}`}>
          {index > 0 ? <ChevronRight className={styles.pathSeparator} size={14} strokeWidth={1.8} /> : null}
          <span className={styles.pathLabel}>{segment}</span>
        </span>
      ))}
    </div>
  );
}

type MermaidPreviewState =
  | { status: "loading" }
  | { status: "ready"; svg: string; dimensions: SvgDimensions | null }
  | { status: "error"; message: string };

const MERMAID_MIN_SCALE = 0.05;
const MERMAID_MAX_SCALE = 3;
const MERMAID_SCALE_STEP = 0.1;
const MERMAID_FIT_PADDING = 32;
const MERMAID_AUTO_FIT_FRAMES = 40;

interface MermaidDragState {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
}

function NativeMermaidPreview({ code, layout = "panel" }: { code: string; layout?: "panel" | "document" }) {
  const [theme, setTheme] = useState<"light" | "dark">(() => getTheme());
  const [state, setState] = useState<MermaidPreviewState>({ status: "loading" });
  const [scale, setScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<MermaidDragState | null>(null);
  const autoFitRef = useRef(true);
  const centerFrameRef = useRef<number | null>(null);
  const autoFitFrameRef = useRef<number | null>(null);
  const autoFitAttemptRef = useRef(0);
  const instanceId = useRef(`preview-mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const themeObserver = new MutationObserver(() => setTheme(getTheme()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => themeObserver.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setState({ status: "error", message: "Mermaid 内容为空" });
      return () => {
        cancelled = true;
      };
    }

    const renderId = `${instanceId.current}-${hashText(trimmedCode)}`;
    setState({ status: "loading" });
    autoFitRef.current = true;
    setScale(1);

    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === "dark" ? "dark" : "default",
          securityLevel: "strict",
          suppressErrorRendering: true,
          flowchart: {
            useMaxWidth: false,
          },
        });
        await mermaid.parse(trimmedCode, { suppressErrors: false });
        const renderHost = document.createElement("div");
        renderHost.setAttribute("data-mermaid-render-host", "true");
        renderHost.style.cssText =
          "position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;";
        document.body.appendChild(renderHost);
        try {
          return await mermaid.render(renderId, trimmedCode, renderHost);
        } finally {
          renderHost.remove();
        }
      })
      .then((result) => {
        if (cancelled) {
          return;
        }
        const svg = typeof result === "string" ? result : result.svg;
        const normalized = normalizeMermaidSvgDimensions(svg);
        setState({ status: "ready", svg: normalized.svg, dimensions: normalized.dimensions });
      })
      .catch((reason: unknown) => {
        if (cancelled) {
          return;
        }
        cleanupGlobalMermaidErrors();
        setState({ status: "error", message: errorMessage(reason) });
      });

    return () => {
      cancelled = true;
    };
  }, [code, theme]);

  const cancelCenterViewport = useCallback(() => {
    if (centerFrameRef.current !== null) {
      window.cancelAnimationFrame(centerFrameRef.current);
      centerFrameRef.current = null;
    }
  }, []);

  const scheduleCenterViewport = useCallback((viewport: HTMLElement, dimensions: SvgDimensions, nextScale: number) => {
    if (!autoFitRef.current) {
      return;
    }
    cancelCenterViewport();
    centerMermaidViewport(viewport, dimensions, nextScale);
    centerFrameRef.current = window.requestAnimationFrame(() => {
      centerFrameRef.current = null;
      if (autoFitRef.current) {
        centerMermaidViewport(viewport, dimensions, nextScale);
      }
    });
  }, [cancelCenterViewport]);

  const cancelAutoFitLoop = useCallback(() => {
    if (autoFitFrameRef.current !== null) {
      window.cancelAnimationFrame(autoFitFrameRef.current);
      autoFitFrameRef.current = null;
    }
    cancelCenterViewport();
  }, [cancelCenterViewport]);

  const fitMermaidToViewport = useCallback(() => {
    if (state.status !== "ready" || !state.dimensions) {
      return false;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return false;
    }
    const next = calculateMermaidFitScale(viewport, state.dimensions);
    if (next === null) {
      return false;
    }
    setScale((current) => (current === next ? current : next));
    scheduleCenterViewport(viewport, state.dimensions, next);
    return true;
  }, [scheduleCenterViewport, state]);

  const scheduleAutoFitLoop = useCallback(() => {
    cancelAutoFitLoop();
    autoFitAttemptRef.current = 0;

    const tick = () => {
      autoFitFrameRef.current = null;
      if (!autoFitRef.current) {
        return;
      }

      fitMermaidToViewport();
      autoFitAttemptRef.current += 1;

      if (autoFitAttemptRef.current < MERMAID_AUTO_FIT_FRAMES) {
        autoFitFrameRef.current = window.requestAnimationFrame(tick);
      }
    };

    autoFitFrameRef.current = window.requestAnimationFrame(tick);
  }, [cancelAutoFitLoop, fitMermaidToViewport]);

  const zoomBy = useCallback((delta: number, focus?: { clientX: number; clientY: number }) => {
    autoFitRef.current = false;
    cancelAutoFitLoop();
    setScale((current) => {
      const next = clampMermaidScale(current + delta);
      const viewport = viewportRef.current;
      if (focus && viewport && next !== current) {
        preserveMermaidZoomAnchor(viewport, current, next, focus);
      }
      return next;
    });
  }, [cancelAutoFitLoop]);

  const resetZoom = () => {
    autoFitRef.current = true;
    if (state.status !== "ready" || !state.dimensions) {
      setScale(1);
      return;
    }
    scheduleAutoFitLoop();
  };

  useLayoutEffect(() => {
    if (!autoFitRef.current) {
      return;
    }
    scheduleAutoFitLoop();
  }, [scheduleAutoFitLoop]);

  useEffect(() => {
    if (state.status !== "ready" || !state.dimensions || typeof ResizeObserver === "undefined") {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (autoFitRef.current) {
        scheduleAutoFitLoop();
      }
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [scheduleAutoFitLoop, state]);

  useEffect(() => {
    return () => {
      if (centerFrameRef.current !== null) {
        window.cancelAnimationFrame(centerFrameRef.current);
      }
      cancelAutoFitLoop();
    };
  }, [cancelAutoFitLoop]);

  useEffect(() => {
    if (state.status !== "ready") {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) === 0) {
        return;
      }
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? MERMAID_SCALE_STEP : -MERMAID_SCALE_STEP, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    };

    viewport.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleNativeWheel);
  }, [state.status, zoomBy]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (state.status !== "ready" || event.button > 0) {
      return;
    }
    autoFitRef.current = false;
    cancelAutoFitLoop();
    dragRef.current = {
      pointerId: pointerIdValue(event),
      startX: pointerCoordinate(event.clientX),
      startY: pointerCoordinate(event.clientY),
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    };
    event.currentTarget.dataset.dragging = "true";
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerIdValue(event)) {
      return;
    }
    event.currentTarget.scrollLeft = drag.scrollLeft - (pointerCoordinate(event.clientX) - drag.startX);
    event.currentTarget.scrollTop = drag.scrollTop - (pointerCoordinate(event.clientY) - drag.startY);
  };

  const clearDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== pointerIdValue(event)) {
      return;
    }
    dragRef.current = null;
    delete event.currentTarget.dataset.dragging;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const scaleLabel = formatMermaidScale(scale);
  const renderDimensions =
    state.status === "ready" && state.dimensions
      ? {
          "--mermaid-render-width": formatMermaidCssPixels(state.dimensions.width * scale),
          "--mermaid-render-height": formatMermaidCssPixels(state.dimensions.height * scale),
        }
      : null;

  return (
    <div className={styles.mermaidPane} data-layout={layout} data-testid="preview-mermaid-pane">
      {state.status === "ready" ? (
        <div className={styles.mermaidControls} aria-label="Mermaid 视图控制">
          <button type="button" aria-label="缩小 Mermaid" title="缩小 Mermaid" onClick={() => zoomBy(-MERMAID_SCALE_STEP)}>
            <ZoomOut size={15} />
          </button>
          <span className={styles.mermaidScaleValue} aria-label={`当前缩放 ${scaleLabel}`}>
            {scaleLabel}
          </span>
          <button type="button" aria-label="放大 Mermaid" title="放大 Mermaid" onClick={() => zoomBy(MERMAID_SCALE_STEP)}>
            <ZoomIn size={15} />
          </button>
          <button type="button" aria-label="重置 Mermaid 视图" title="重置 Mermaid 视图" onClick={resetZoom}>
            <RotateCcw size={15} />
          </button>
        </div>
      ) : null}
      {state.status === "ready" ? (
        <div
          ref={viewportRef}
          className={styles.mermaidSvg}
          aria-label="Mermaid 图表"
          data-interactive="true"
          style={
            {
              "--mermaid-scale": scale,
              ...renderDimensions,
            } as CSSProperties
          }
          onPointerCancel={clearDrag}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={clearDrag}
        >
          <div
            className={styles.mermaidSvgContent}
            data-sized={state.dimensions ? "true" : "false"}
            dangerouslySetInnerHTML={{ __html: state.svg }}
          />
        </div>
      ) : state.status === "error" ? (
        <div className={styles.mermaidStatus} role="alert">
          {state.message}
        </div>
      ) : (
        <div className={styles.mermaidStatus} aria-hidden="true" />
      )}
    </div>
  );
}

function clampMermaidScale(value: number): number {
  return Math.min(MERMAID_MAX_SCALE, Math.max(MERMAID_MIN_SCALE, Math.round(value * 100) / 100));
}

function calculateMermaidFitScale(viewport: HTMLElement, dimensions: SvgDimensions): number | null {
  const availableWidth = viewport.clientWidth - MERMAID_FIT_PADDING;
  const availableHeight = viewport.clientHeight - MERMAID_FIT_PADDING;
  if (availableWidth <= 0 || availableHeight <= 0) {
    return null;
  }
  return clampMermaidScale(Math.min(availableWidth / dimensions.width, availableHeight / dimensions.height));
}

function centerMermaidViewport(viewport: HTMLElement, dimensions: SvgDimensions, scale: number) {
  viewport.scrollLeft = Math.max(0, (dimensions.width * scale - viewport.clientWidth) / 2);
  viewport.scrollTop = Math.max(0, (dimensions.height * scale - viewport.clientHeight) / 2);
}

function formatMermaidScale(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function preserveMermaidZoomAnchor(
  viewport: HTMLElement,
  currentScale: number,
  nextScale: number,
  focus: { clientX: number; clientY: number },
) {
  const rect = viewport.getBoundingClientRect();
  const viewportX = focus.clientX - rect.left;
  const viewportY = focus.clientY - rect.top;
  const anchorX = viewport.scrollLeft + viewportX;
  const anchorY = viewport.scrollTop + viewportY;
  const ratio = nextScale / currentScale;

  window.requestAnimationFrame(() => {
    viewport.scrollLeft = Math.max(0, anchorX * ratio - viewportX);
    viewport.scrollTop = Math.max(0, anchorY * ratio - viewportY);
  });
}

function pointerIdValue(event: ReactPointerEvent<HTMLElement>): number {
  return Number.isFinite(event.pointerId) ? event.pointerId : 1;
}

function pointerCoordinate(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function getCodeChild(node: ReactNode): { props?: { className?: string; children?: ReactNode } } | null {
  if (Array.isArray(node)) {
    return getCodeChild(node[0]);
  }
  if (node && typeof node === "object" && "props" in node) {
    return node as { props?: { className?: string; children?: ReactNode } };
  }
  return null;
}

function codeBlockLanguage(className?: string): string {
  const match = /language-([\w+-]+)/.exec(className ?? "");
  return match?.[1]?.toLowerCase() ?? "text";
}

function extractMarkdownText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractMarkdownText).join("");
  }
  if (node && typeof node === "object" && "props" in node) {
    return extractMarkdownText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

function stripTrailingNewline(text: string): string {
  return text.replace(/\n$/, "");
}

function getTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function hashText(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function cleanupGlobalMermaidErrors() {
  document.querySelectorAll(".error-icon, .error-text").forEach((element) => {
    const svg = element.closest("svg");
    const wrapper = svg?.parentElement;
    if (!svg || !wrapper) {
      return;
    }
    if (wrapper.parentElement === document.body && wrapper.id.startsWith("dmermaid-")) {
      wrapper.remove();
      return;
    }
    if (svg.parentElement === document.body && svg.id.startsWith("mermaid-")) {
      svg.remove();
    }
  });
}

function workspaceScope({
  workspaceId,
  sessionId,
}: {
  workspaceId?: string;
  sessionId?: string;
}): WorkspaceScope | null {
  if (sessionId) {
    return { sessionId };
  }
  if (workspaceId) {
    return { workspaceId };
  }
  return null;
}

function annotationWorkspaceRuntime(runtime: RuntimeBridge | undefined): AnnotationWorkspaceRuntime | null {
  const workspace = runtime?.workspace as Partial<RuntimeBridge["workspace"]> | undefined;
  if (
    typeof workspace?.listAnnotations !== "function" ||
    typeof workspace.createAnnotation !== "function" ||
    typeof workspace.updateAnnotation !== "function" ||
    typeof workspace.deleteAnnotation !== "function"
  ) {
    return null;
  }
  return workspace as AnnotationWorkspaceRuntime;
}

function DiffPreview({ diff }: { diff: string }) {
  const lines = parseUnifiedDiffDisplayLines(diff);
  return (
    <div className={styles.diffPane} aria-label="Diff 渲染内容">
      {lines.map((line) => (
        <div key={line.key} className={styles.diffLine} data-kind={line.kind}>
          <span className={styles.diffLineNo}>{line.lineNumber ?? ""}</span>
          <code>
            {line.sign}
            {line.content || " "}
          </code>
        </div>
      ))}
    </div>
  );
}

function immediatePreviewContent(request: FilePreviewRequest): string | null {
  if (request.type === "content") {
    return request.content || "";
  }
  if (request.type === "diff") {
    return request.diff || "暂无 diff";
  }
  return null;
}

function defaultViewMode(request: FilePreviewRequest): "preview" | "source" {
  const kind = detectPreviewKind(request);
  return kind === "markdown" || kind === "html" || kind === "diff" || kind === "mermaid" ? "preview" : "source";
}

function detectPreviewKind(request: FilePreviewRequest): PreviewKind {
  if (request.type === "content") {
    return contentKindToPreviewKind(request.contentType);
  }
  if (request.type === "diff") {
    return "diff";
  }
  const path = request.path;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["md", "mdx", "markdown"].includes(ext)) {
    return "markdown";
  }
  if (["html", "htm", "xml"].includes(ext)) {
    return "html";
  }
  if (["diff", "patch"].includes(ext)) {
    return "diff";
  }
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "ico", "avif"].includes(ext)) {
    return "image";
  }
  if (ext === "json") {
    return "json";
  }
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "mjs",
      "cjs",
      "py",
      "rs",
      "go",
      "java",
      "kt",
      "cs",
      "cpp",
      "c",
      "h",
      "css",
      "scss",
      "sass",
      "less",
      "sql",
      "yaml",
      "yml",
      "toml",
      "sh",
      "bash",
      "ps1",
      "vue",
    ].includes(ext)
  ) {
    return "code";
  }
  return "text";
}

function contentKindToPreviewKind(kind: PreviewContentKind): PreviewKind {
  if (kind === "mermaid") {
    return "mermaid";
  }
  return kind;
}

function formatSource(content: string, kind: PreviewKind): string {
  if (!content) {
    return "文件为空";
  }
  if (kind !== "json") {
    return content;
  }
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function sourceLanguage(request: FilePreviewRequest, kind: PreviewKind): string {
  if (request.type === "content") {
    return kind === "mermaid" ? "mermaid" : kind;
  }
  if (request.type === "diff") {
    return "diff";
  }
  const ext = request.path.split(".").pop()?.toLowerCase() ?? "";
  const languageByExtension: Record<string, string> = {
    cjs: "javascript",
    css: "css",
    diff: "diff",
    go: "go",
    htm: "html",
    html: "html",
    java: "java",
    js: "javascript",
    json: "json",
    jsx: "jsx",
    md: "markdown",
    mdx: "markdown",
    patch: "diff",
    py: "python",
    rs: "rust",
    scss: "scss",
    sh: "bash",
    sql: "sql",
    ts: "typescript",
    tsx: "tsx",
    vue: "xml",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
  };
  return languageByExtension[ext] ?? (kind === "code" ? ext || "text" : kind);
}

function countLines(text: string): number {
  if (!text) {
    return 1;
  }
  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      lines += 1;
    }
  }
  return lines;
}

function lineNumbersText(lineCount: number): string {
  return Array.from({ length: Math.max(1, lineCount) }, (_, index) => String(index + 1)).join("\n");
}

function ImagePreview({
  media,
  title,
  sourceLabel,
}: {
  media: WorkspaceMediaResponse | null;
  title: string;
  sourceLabel: string;
}) {
  if (!media) {
    return <div className={styles.imageStatus}>图片未加载</div>;
  }

  return (
    <figure className={styles.imagePane}>
      <img className={styles.imageFrame} src={media.data_url} alt={title || sourceLabel} />
      <figcaption className={styles.imageMeta}>
        <span>{media.media_type}</span>
        <span>{formatBytes(media.size)}</span>
      </figcaption>
    </figure>
  );
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function previewTitle(request: FilePreviewRequest): string {
  if (request.type === "content") {
    return request.title;
  }
  return fileName(request.path);
}

function previewSourceLabel(request: FilePreviewRequest): string {
  if (request.type === "content") {
    return request.sourcePath ?? "消息内容";
  }
  return request.path;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (reason && typeof reason === "object" && typeof (reason as { message?: unknown }).message === "string") {
    return (reason as { message: string }).message;
  }
  return "文件预览失败";
}
