import { describe, expect, it } from "vitest";

import { getMermaidConfig } from "@/renderer/utils/mermaidConfig";

describe("getMermaidConfig", () => {
  it("uses Mermaid's built-in neutral theme instead of custom theme variables", () => {
    const config = getMermaidConfig("light");

    expect(config.theme).toBe("neutral");
    expect(config.look).toBe("classic");
    expect(config.securityLevel).toBe("strict");
    expect(config.flowchart).toEqual({ useMaxWidth: false });
    expect(config.themeVariables).toBeUndefined();
  });

  it("keeps dark Mermaid diagrams on the same built-in neutral theme", () => {
    const config = getMermaidConfig("dark");

    expect(config.theme).toBe("neutral");
    expect(config.themeVariables).toBeUndefined();
  });
});
