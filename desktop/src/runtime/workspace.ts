import type { HttpClient } from "./httpClient";

export interface WorkspaceEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number | null;
  modified_at?: string | null;
}

export interface WorkspaceTreeResponse {
  root: string;
  entries: WorkspaceEntry[];
}

export interface WorkspaceFileResponse {
  path: string;
  content: string;
  encoding: string;
}

export interface WorkspaceMediaResponse {
  path: string;
  media_type: string;
  size: number;
  data_url: string;
}

export interface WorkspaceSearchResult {
  path: string;
  name: string;
  type: "file" | "directory";
}

export interface WorkspaceSearchOptions {
  signal?: AbortSignal;
}

export type WorkspaceFileAnnotationAnchorType = "file" | "selection";

export interface WorkspaceFileAnnotation {
  id: string;
  scope_type: "session" | "workspace";
  scope_id: string;
  workspace_id?: string | null;
  path: string;
  anchor_type: WorkspaceFileAnnotationAnchorType;
  comment: string;
  selected_text?: string | null;
  line_start?: number | null;
  line_end?: number | null;
  column_start?: number | null;
  column_end?: number | null;
  content_hash?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceFileAnnotationInput {
  path: string;
  anchor_type: WorkspaceFileAnnotationAnchorType;
  comment: string;
  selected_text?: string | null;
  line_start?: number | null;
  line_end?: number | null;
  column_start?: number | null;
  column_end?: number | null;
  content_hash?: string | null;
}

export interface WorkspaceFileAnnotationUpdate {
  anchor_type?: WorkspaceFileAnnotationAnchorType;
  comment?: string;
  selected_text?: string | null;
  line_start?: number | null;
  line_end?: number | null;
  column_start?: number | null;
  column_end?: number | null;
  content_hash?: string | null;
}

export interface WorkspaceAnnotationListOptions {
  signal?: AbortSignal;
}

export type WorkspaceScope =
  | { workspaceId: string; sessionId?: never }
  | { sessionId: string; workspaceId?: never };

export interface WorkspaceRuntime {
  listDirectory(scope: WorkspaceScope, path?: string): Promise<WorkspaceTreeResponse>;
  readFile(scope: WorkspaceScope, path: string): Promise<WorkspaceFileResponse>;
  readMedia(scope: WorkspaceScope, path: string): Promise<WorkspaceMediaResponse>;
  search(scope: WorkspaceScope, query: string, options?: WorkspaceSearchOptions): Promise<WorkspaceSearchResult[]>;
  listAnnotations(
    scope: WorkspaceScope,
    path: string,
    options?: WorkspaceAnnotationListOptions,
  ): Promise<WorkspaceFileAnnotation[]>;
  createAnnotation(
    scope: WorkspaceScope,
    payload: WorkspaceFileAnnotationInput,
  ): Promise<WorkspaceFileAnnotation>;
  updateAnnotation(
    scope: WorkspaceScope,
    annotationId: string,
    payload: WorkspaceFileAnnotationUpdate,
  ): Promise<WorkspaceFileAnnotation>;
  deleteAnnotation(scope: WorkspaceScope, annotationId: string): Promise<void>;
}

export function createWorkspaceRuntime(http: HttpClient): WorkspaceRuntime {
  return {
    listDirectory(scope, path = "") {
      return http.request<WorkspaceTreeResponse>(
        `${workspaceBasePath(scope)}/tree?path=${encodeURIComponent(path)}`,
      );
    },
    readFile(scope, path) {
      return http.request<WorkspaceFileResponse>(
        `${workspaceBasePath(scope)}/read?path=${encodeURIComponent(path)}`,
      );
    },
    readMedia(scope, path) {
      return http.request<WorkspaceMediaResponse>(
        `${workspaceBasePath(scope)}/media?path=${encodeURIComponent(path)}`,
      );
    },
    search(scope, query, options = {}) {
      return http.request<WorkspaceSearchResult[]>(
        `${workspaceBasePath(scope)}/search?q=${encodeURIComponent(query)}`,
        { signal: options.signal },
      );
    },
    listAnnotations(scope, path, options = {}) {
      return http.request<WorkspaceFileAnnotation[]>(
        `${workspaceBasePath(scope)}/annotations?path=${encodeURIComponent(path)}`,
        { signal: options.signal },
      );
    },
    createAnnotation(scope, payload) {
      return http.request<WorkspaceFileAnnotation>(
        `${workspaceBasePath(scope)}/annotations`,
        {
          method: "POST",
          body: payload,
        },
      );
    },
    updateAnnotation(scope, annotationId, payload) {
      return http.request<WorkspaceFileAnnotation>(
        `${workspaceBasePath(scope)}/annotations/${encodeURIComponent(annotationId)}`,
        {
          method: "PATCH",
          body: payload,
        },
      );
    },
    deleteAnnotation(scope, annotationId) {
      return http.request<void>(
        `${workspaceBasePath(scope)}/annotations/${encodeURIComponent(annotationId)}`,
        { method: "DELETE" },
      );
    },
  };
}

function workspaceBasePath(scope: WorkspaceScope): string {
  if ("sessionId" in scope && scope.sessionId) {
    return `/api/sessions/${encodeURIComponent(scope.sessionId)}/workspace`;
  }
  if ("workspaceId" in scope && scope.workspaceId) {
    return `/api/workspaces/${encodeURIComponent(scope.workspaceId)}`;
  }
  throw new Error("workspace scope requires sessionId or workspaceId");
}
