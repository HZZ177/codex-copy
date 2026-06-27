import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  clampWorkbenchDrawerWidth,
  getWorkbenchAssistantGeometry,
  workbenchAssistantGeometryCssVars,
} from "../src/renderer/pages/workbench/workbenchAssistantGeometry";

describe("workbench assistant geometry", () => {
  it("defines stable capsule, composer, expanded and drawer placement contracts", () => {
    expect(getWorkbenchAssistantGeometry("capsule", { drawerWidth: 420, viewportWidth: 1440 })).toMatchObject({
      width: "min(560px, calc(100% - 56px))",
      height: "auto",
      inset: "auto auto 16px 50%",
      radius: 999,
      zIndex: 55,
      pointerEvents: "auto",
    });
    expect(getWorkbenchAssistantGeometry("composer", { drawerWidth: 420, viewportWidth: 1440 })).toMatchObject({
      width: "min(640px, calc(100% - 56px))",
      radius: 20,
      pointerEvents: "auto",
    });
    expect(getWorkbenchAssistantGeometry("expanded", { drawerWidth: 420, viewportWidth: 1440 })).toMatchObject({
      width: "100%",
      inset: "48px 0 104px",
      zIndex: 58,
      pointerEvents: "none",
    });
    expect(getWorkbenchAssistantGeometry("drawer", { drawerWidth: 420, viewportWidth: 1440 })).toMatchObject({
      width: "420px",
      height: "100%",
      inset: "0 0 0 auto",
      radius: 18,
      zIndex: 2,
      pointerEvents: "auto",
    });
  });

  it("clamps drawer width for common desktop and narrow viewport sizes", () => {
    expect(clampWorkbenchDrawerWidth(280, 1440)).toBe(320);
    expect(clampWorkbenchDrawerWidth(420, 1280)).toBe(420);
    expect(clampWorkbenchDrawerWidth(720, 1600)).toBe(520);
    expect(clampWorkbenchDrawerWidth(520, 900)).toBe(414);
  });

  it("exports CSS variables for the shell animation layer", () => {
    expect(workbenchAssistantGeometryCssVars("drawer", { drawerWidth: 420, viewportWidth: 1440 })).toEqual({
      "--workbench-assistant-geometry-height": "100%",
      "--workbench-assistant-geometry-inset": "0 0 0 auto",
      "--workbench-assistant-geometry-pointer-events": "auto",
      "--workbench-assistant-geometry-radius": "18px",
      "--workbench-assistant-geometry-width": "420px",
      "--workbench-assistant-geometry-z-index": 2,
    });
  });

  it("keeps responsive shell width constraints in the workbench CSS contract", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/renderer/pages/workbench/WorkbenchAssistantSurface.module.css"),
      "utf8",
    );

    expect(css).toContain("--workbench-assistant-dock-inline-size: min(clamp(320px, var(--workbench-assistant-dock-width), 520px), 46vw)");
    expect(css).toContain(".chrome[data-shell-mode=\"capsule\"]");
    expect(css).toContain("width: min(560px, 100%)");
    expect(css).toContain(".overlayPanel");
    expect(css).toContain("width: min(760px, 100%)");
    expect(css).toContain("--workbench-assistant-dock-inline-size: min(380px, 48vw)");
  });

  it("keeps dock morph transitions on an opaque panel that collapses back to the capsule", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/renderer/pages/workbench/WorkbenchAssistantSurface.module.css"),
      "utf8",
    );

    expect(css).toContain(".chrome[data-shell-mode=\"dock-morph\"]");
    expect(css).toMatch(/\.shell\[data-shell-mode="dock-morph"\]\[data-dock-layout="overlay"\]\s*\{[\s\S]*padding: 6px 0 8px/);
    expect(css).toMatch(/\.chrome\[data-shell-mode="dock-morph"\]\s*\{[\s\S]*background: var\(--workbench-assistant-transition-bg\)/);
    expect(css).toContain(".chrome[data-shell-mode=\"dock-out-morph\"]");
    expect(css).toMatch(/\.chrome\[data-shell-mode="dock-out-morph"\]\s*\{[\s\S]*animation: dockOutChromeToTarget var\(--workbench-assistant-compose-duration\)/);
    expect(css).toContain(".surface[data-dock-transition=\"dock-out\"] .morphPanel");
    expect(css).toContain("animation: morphPanelConcealToCapsule var(--workbench-assistant-compose-duration)");
    expect(css).toMatch(/@keyframes morphPanelConcealToCapsule\s*\{[\s\S]*clip-path: inset\(50% 0 50% 0 round 18px\)/);
    expect(css).toMatch(/@keyframes dockOutChromeToTarget\s*\{[\s\S]*0%\s*\{[\s\S]*left: calc\(100% - var\(--workbench-assistant-dock-inline-size\)\)/);
    expect(css).toMatch(/@keyframes dockOutChromeToTarget\s*\{[\s\S]*100%\s*\{[\s\S]*bottom: 16px/);
    expect(css).toMatch(/@keyframes dockOutChromeToTarget\s*\{[\s\S]*100%\s*\{[\s\S]*left: 50%/);
    expect(css).toMatch(/@keyframes dockOutChromeToTarget\s*\{[\s\S]*100%\s*\{[\s\S]*transform: translateX\(-50%\)/);
    expect(css).not.toContain("52% {");
    expect(css).not.toContain("78% {");
    expect(css).toContain("animation: dockOutComposerFrameToCapsule var(--workbench-assistant-compose-duration)");
    expect(css).toContain("animation: dockOutInputSurfaceToCapsule var(--workbench-assistant-compose-duration)");
    expect(css).toMatch(/\.shell\[data-transition-phase="dock-out"\] \.chrome\s*\{[\s\S]*transform-origin: bottom center/);
    expect(css).toMatch(/\.surface\[data-dock-transition="dock-out"\] \.morphPanel\[data-panel-mode="morph"\] \.morphMiddle\s*\{[\s\S]*transform-origin: bottom center/);
    expect(css).toMatch(/\.surface\[data-dock-transition="dock-out"\] \.capsule,\s*\.surface\[data-dock-transition="dock-out"\] \.composerFrame,\s*\.surface\[data-dock-transition="dock-out"\] \.inputSurface\s*\{[\s\S]*transform-origin: bottom center/);
    expect(css).not.toContain("morphPanelDockOut");
  });

  it("does not put long shell-style transitions on the base chrome because dock-in must move and grow together", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/renderer/pages/workbench/WorkbenchAssistantSurface.module.css"),
      "utf8",
    );

    const baseChromeRule = css.match(/\.chrome\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    expect(baseChromeRule).not.toContain("transition:");
    expect(baseChromeRule).not.toContain("border-radius var(--workbench-assistant-compose-duration)");
    expect(baseChromeRule).not.toContain("background var(--workbench-assistant-compose-duration)");
  });

  it("keeps the fixed drawer conversation panel visually stable without a second reveal", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/renderer/pages/workbench/WorkbenchAssistantSurface.module.css"),
      "utf8",
    );

    expect(css).not.toContain("drawerPanelSettleIn");
    expect(css).not.toContain("drawerPanelGrowFromComposer");
    expect(css).not.toContain("clip-path: inset(92% 0 0 0");
    expect(css).not.toContain("drawerPanelContentReveal");
    const drawerPanelRule = css.match(/\.drawerPanel\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    expect(drawerPanelRule).not.toContain("animation:");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.drawerPanel/);
  });

  it("keeps the settled drawer chrome visually aligned with the morph endpoint", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/renderer/pages/workbench/WorkbenchAssistantSurface.module.css"),
      "utf8",
    );

    expect(css).toContain("--workbench-assistant-drawer-radius: 18px");
    expect(css).toMatch(/\.chrome\[data-shell-mode="drawer"\]\s*\{[\s\S]*border: 1px solid color-mix\(in srgb, var\(--color-border-subtle\) 78%, transparent\)/);
    expect(css).toMatch(/\.chrome\[data-shell-mode="drawer"\]\s*\{[\s\S]*border-right: 0/);
    expect(css).toMatch(/\.chrome\[data-shell-mode="drawer"\]\s*\{[\s\S]*box-shadow: -16px 0 42px rgb\(15 23 42 \/ 8%\)/);
    expect(css).toMatch(/\.chrome\[data-shell-mode="drawer"\]\s*\{[\s\S]*border-radius: var\(--workbench-assistant-drawer-radius\) 0 0 var\(--workbench-assistant-drawer-radius\)/);
    expect(css).toMatch(/\.chrome\[data-shell-mode="dock-morph"\]\s*\{[\s\S]*border-radius: var\(--workbench-assistant-drawer-radius\) 0 0 var\(--workbench-assistant-drawer-radius\)/);
    expect(css).toMatch(/\.morphPanel\s*\{[\s\S]*border-radius: inherit/);
    expect(css).toMatch(/\.drawer\s*\{[\s\S]*border-radius: inherit/);
    expect(css).toMatch(/\.drawer > \.drawerHeader\s*\{[\s\S]*background: transparent/);
    expect(css).toMatch(/\.drawer > \.drawerHeader\s*\{[\s\S]*box-shadow: none/);
    expect(css).toMatch(/\.drawerPanel\s*\{[\s\S]*background: transparent/);
    expect(css).toMatch(/\.drawerPanel\s*\{[\s\S]*box-shadow: none/);
    expect(css).not.toContain(".drawerComposer");
    expect(css).toMatch(/\.chrome\[data-shell-mode="drawer"\] \.capsule,\s*\.chrome\[data-shell-mode="dock-morph"\] \.capsule,\s*\.chrome\[data-shell-mode="dock-out-morph"\] \.capsule\s*\{[\s\S]*padding: 8px 10px 16px/);
  });

  it("keeps the inline assistant host transparent so rounded drawer corners do not show a rectangular backing", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/renderer/pages/workbench/WorkbenchAssistantSurface.module.css"),
      "utf8",
    );

    expect(css).toMatch(/\.surface\[data-dock-layout="inline"\]\s*\{[\s\S]*background: transparent/);
    expect(css).toMatch(/\.surface\[data-dock-layout="inline"\]\s*\{[\s\S]*border-left: 0/);
    expect(css).toMatch(/\.surface\[data-dock-layout="inline"\]\s*\{[\s\S]*overflow: visible/);
    expect(css).toMatch(/\.surface\[data-dock-layout="inline"\]\s*\{[\s\S]*padding: 6px 0 8px/);
  });
});
