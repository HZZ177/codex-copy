import { afterEach, describe, expect, it } from "vitest";

import { prefersReducedMotion } from "@/renderer/utils/motionPreference";

import { mockReducedMotionPreference } from "./helpers/motionPreference";

let restoreMotionPreference: (() => void) | null = null;

afterEach(() => {
  restoreMotionPreference?.();
  restoreMotionPreference = null;
});

describe("motion preference test helpers", () => {
  it("can force reduced-motion mode for motion-sensitive component tests", () => {
    restoreMotionPreference = mockReducedMotionPreference(true);

    expect(prefersReducedMotion()).toBe(true);
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
  });

  it("can force normal motion mode for layout animation tests", () => {
    restoreMotionPreference = mockReducedMotionPreference(false);

    expect(prefersReducedMotion()).toBe(false);
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);
  });
});
