import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useWorkspaceSkills } from "@/renderer/hooks/useWorkspaceSkills";
import type { RuntimeBridge, WorkspaceSkillsResponse } from "@/runtime";

describe("useWorkspaceSkills", () => {
  it("stays idle when workspace skills are disabled for the current session", () => {
    const listSkills = vi.fn();
    const runtime = runtimeWithListSkills(listSkills);

    const { result } = renderHook(() =>
      useWorkspaceSkills({
        runtime,
        scope: { sessionId: "ses-1" },
        enabled: false,
      }),
    );

    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.skills).toEqual([]);
    expect(listSkills).not.toHaveBeenCalled();
  });

  it("loads workspace skills for a workspace session", async () => {
    const response = skillsResponse({
      fingerprint: "fp-1",
      skills: [{ name: "dev-plan", description: "Plan work" }],
    });
    const listSkills = vi.fn().mockResolvedValue(response);
    const runtime = runtimeWithListSkills(listSkills);

    const { result } = renderHook(() =>
      useWorkspaceSkills({
        runtime,
        scope: { sessionId: "ses-1" },
        enabled: true,
      }),
    );

    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    expect(listSkills).toHaveBeenCalledWith({ sessionId: "ses-1" }, { forceReload: false });
    expect(result.current.state.skills).toEqual(response.skills);
    expect(result.current.state.fingerprint).toBe("fp-1");
    expect(result.current.state.loadedAt).toBe(Date.parse(response.loaded_at));
  });

  it("reloads when the session id changes", async () => {
    const listSkills = vi
      .fn()
      .mockResolvedValueOnce(skillsResponse({ fingerprint: "fp-1" }))
      .mockResolvedValueOnce(skillsResponse({ fingerprint: "fp-2" }));
    const runtime = runtimeWithListSkills(listSkills);

    const { result, rerender } = renderHook(
      ({ sessionId }) =>
        useWorkspaceSkills({
          runtime,
          scope: { sessionId },
          enabled: true,
        }),
      { initialProps: { sessionId: "ses-1" } },
    );
    await waitFor(() => expect(result.current.state.fingerprint).toBe("fp-1"));

    rerender({ sessionId: "ses-2" });

    await waitFor(() => expect(result.current.state.fingerprint).toBe("fp-2"));
    expect(listSkills).toHaveBeenNthCalledWith(2, { sessionId: "ses-2" }, { forceReload: false });
  });

  it("loads workspace skills for a workspace id before a session exists", async () => {
    const response = skillsResponse({
      fingerprint: "fp-workspace",
      skills: [{ name: "dev-plan", description: "Plan work" }],
    });
    const listSkills = vi.fn().mockResolvedValue(response);
    const runtime = runtimeWithListSkills(listSkills);

    const { result } = renderHook(() =>
      useWorkspaceSkills({
        runtime,
        scope: { workspaceId: "ws-1" },
        enabled: true,
      }),
    );

    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    expect(listSkills).toHaveBeenCalledWith({ workspaceId: "ws-1" }, { forceReload: false });
    expect(result.current.state.skills).toEqual(response.skills);
  });

  it("force reload preserves old skills when the refresh fails", async () => {
    const initial = skillsResponse({
      fingerprint: "fp-1",
      skills: [{ name: "dev-plan", description: "Plan work" }],
    });
    const listSkills = vi.fn().mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error("gone"));
    const runtime = runtimeWithListSkills(listSkills);
    const { result } = renderHook(() =>
      useWorkspaceSkills({
        runtime,
        scope: { sessionId: "ses-1" },
        enabled: true,
      }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    await act(async () => {
      await result.current.refresh({ forceReload: true });
    });

    expect(listSkills).toHaveBeenNthCalledWith(2, { sessionId: "ses-1" }, { forceReload: true });
    expect(result.current.state.status).toBe("error");
    expect(result.current.state.skills).toEqual(initial.skills);
    expect(result.current.state.error).toBe("gone");
  });
});

function runtimeWithListSkills(listSkills: ReturnType<typeof vi.fn>) {
  return {
    workspace: {
      listSkills,
    },
  } as unknown as Pick<RuntimeBridge, "workspace">;
}

function skillsResponse({
  fingerprint = "fp",
  skills = [],
}: {
  fingerprint?: string;
  skills?: Array<{ name: string; description: string }>;
} = {}): WorkspaceSkillsResponse {
  return {
    workspace_root: "D:/repo",
    fingerprint,
    loaded_at: "2026-06-25T12:00:00Z",
    skills: skills.map((skill) => ({
      ...skill,
      source: "workspace",
      label: `/${skill.name}`,
      locator: `.keydex/skills/${skill.name}/SKILL.md`,
    })),
    diagnostics: [],
  };
}
