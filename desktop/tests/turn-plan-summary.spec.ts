import { describe, expect, it } from "vitest";

import { activePlanEntryIndex, type TurnPlanEntry } from "@/renderer/pages/conversation/turnPlanSummary";

describe("turn plan summary", () => {
  it("selects the latest non-pending step instead of prioritizing an earlier failure", () => {
    expect(activePlanEntryIndex(entries(["completed", "failed", "completed"]))).toBe(2);
  });

  it("keeps the running step selected when it is the latest non-pending step", () => {
    expect(activePlanEntryIndex(entries(["completed", "failed", "in_progress", "pending"]))).toBe(2);
  });

  it("falls back to the first pending step before work starts", () => {
    expect(activePlanEntryIndex(entries(["pending", "pending", "pending"]))).toBe(0);
  });

  it("returns -1 for an empty plan", () => {
    expect(activePlanEntryIndex([])).toBe(-1);
  });
});

function entries(statuses: TurnPlanEntry["status"][]): TurnPlanEntry[] {
  return statuses.map((status, index) => ({
    content: `Step ${index + 1}`,
    status,
  }));
}
