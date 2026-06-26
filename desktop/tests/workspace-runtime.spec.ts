import { describe, expect, it, vi } from "vitest";

import type { HttpClient } from "@/runtime/httpClient";
import { createWorkspaceRuntime, type WorkspaceSkillsResponse } from "@/runtime/workspace";

describe("workspace runtime", () => {
  it("loads workspace skills through the session workspace endpoint", async () => {
    const response: WorkspaceSkillsResponse = {
      workspace_root: "D:/repo",
      fingerprint: "abc123",
      loaded_at: "2026-06-25T12:00:00Z",
      skills: [
        {
          name: "dev-plan",
          description: "Create a development plan",
          source: "workspace",
          label: "/dev-plan",
          locator: ".keydex/skills/dev-plan/SKILL.md",
        },
      ],
      diagnostics: [],
    };
    const request = vi.fn(async () => response);
    const runtime = createWorkspaceRuntime({ request } as unknown as HttpClient);

    await expect(runtime.listSkills({ sessionId: "ses 1" })).resolves.toBe(response);

    expect(request).toHaveBeenCalledWith("/api/sessions/ses%201/workspace/skills", {
      signal: undefined,
    });
  });

  it("loads workspace skills through the workspace endpoint before a session exists", async () => {
    const response: WorkspaceSkillsResponse = {
      workspace_root: "D:/repo",
      fingerprint: "abc123",
      loaded_at: "2026-06-25T12:00:00Z",
      skills: [],
      diagnostics: [],
    };
    const request = vi.fn(async () => response);
    const runtime = createWorkspaceRuntime({ request } as unknown as HttpClient);

    await expect(runtime.listSkills({ workspaceId: "ws 1" })).resolves.toBe(response);

    expect(request).toHaveBeenCalledWith("/api/workspaces/ws%201/skills", {
      signal: undefined,
    });
  });

  it("passes force reload and abort signal when loading workspace skills", async () => {
    const response: WorkspaceSkillsResponse = {
      workspace_root: "D:/repo",
      fingerprint: "abc123",
      loaded_at: "2026-06-25T12:00:00Z",
      skills: [],
      diagnostics: [
        {
          code: "skill_frontmatter_missing_description",
          reason: "frontmatter field 'description' is required",
          path: ".keydex/skills/broken/SKILL.md",
          severity: "error",
          details: {},
        },
      ],
    };
    const signal = new AbortController().signal;
    const request = vi.fn(async () => response);
    const runtime = createWorkspaceRuntime({ request } as unknown as HttpClient);

    await expect(
      runtime.listSkills({ sessionId: "ses 1" }, { forceReload: true, signal }),
    ).resolves.toBe(response);

    expect(request).toHaveBeenCalledWith(
      "/api/sessions/ses%201/workspace/skills?force_reload=true",
      { signal },
    );
  });
});
