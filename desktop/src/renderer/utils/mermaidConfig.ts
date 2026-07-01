import type { MermaidConfig } from "mermaid";

export type MermaidThemeMode = "light" | "dark";

const BASE_MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  suppressErrorRendering: true,
  look: "classic",
  theme: "neutral",
  flowchart: {
    useMaxWidth: false,
  },
} satisfies MermaidConfig;

export function getMermaidConfig(_theme: MermaidThemeMode): MermaidConfig {
  return {
    ...BASE_MERMAID_CONFIG,
  };
}
