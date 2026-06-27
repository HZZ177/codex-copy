import { vi } from "vitest";

export function mockReducedMotionPreference(matches: boolean): () => void {
  const previousMatchMedia = window.matchMedia;
  const matchMedia = vi.fn((query: string): MediaQueryList => {
    const isReducedMotionQuery = query.includes("prefers-reduced-motion");
    return {
      matches: isReducedMotionQuery ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: matchMedia,
  });

  return () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: previousMatchMedia,
    });
  };
}
