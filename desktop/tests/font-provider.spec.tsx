import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FontProvider, useFontPreference } from "@/renderer/providers/FontProvider";
import type { SettingsRuntime } from "@/runtime/settings";
import type { AppFontFamily } from "@/types/protocol";
import { installIndexedDbMock } from "./helpers/indexedDbMock";

const MAPLE_FONT_CSS = '@font-face{font-family:"Maple Mono CN";src:local("Maple Mono CN"),url("./font.woff2")format("woff2");font-style:normal;font-display:swap;font-weight:400;unicode-range:U+4E00-9FFF;}';
const JETBRAINS_FONT_CSS = "@font-face{font-family:'JetBrains Mono';font-style:normal;font-display:swap;font-weight:400;src:url(./files/jetbrains-mono-latin-400-normal.woff2) format('woff2');unicode-range:U+0000-00FF;}";

function FontHarness() {
  const font = useFontPreference();
  return (
    <div>
      <span data-testid="family">{font.family}</span>
      <span data-testid="downloading-family">{font.downloadingFamily}</span>
      <span data-testid="status">{font.status}</span>
      <span data-testid="cached-maple">{String(font.cachedFamilies["maple-mono"])}</span>
      <span data-testid="cached-jetbrains">{String(font.cachedFamilies["jetbrains-mono"])}</span>
      <span data-testid="error">{font.error}</span>
      <span data-testid="progress">
        {font.progress.downloadedBytes}/{font.progress.totalBytes}/{font.progress.percent}
      </span>
      <button type="button" onClick={() => void font.setFamily("maple-mono")}>
        Maple Mono
      </button>
      <button type="button" onClick={() => void font.setFamily("jetbrains-mono")}>
        JetBrains Mono
      </button>
      <button type="button" onClick={() => void font.setFamily("system")}>
        系统默认
      </button>
    </div>
  );
}

function renderProvider({
  children,
  settingsRuntime,
}: PropsWithChildren<{ settingsRuntime?: SettingsRuntime | null }>) {
  return render(<FontProvider settingsRuntime={settingsRuntime}>{children}</FontProvider>);
}

function mockSuccessfulFontDownload() {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith("/result.css")) {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/css" }),
        text: () => Promise.resolve(MAPLE_FONT_CSS),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(MAPLE_FONT_CSS).buffer),
      } as Response);
    }
    if (url.includes("@fontsource/jetbrains-mono") && url.endsWith(".css")) {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/css" }),
        text: () => Promise.resolve(JETBRAINS_FONT_CSS),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(JETBRAINS_FONT_CSS).buffer),
      } as Response);
    }

    return Promise.resolve({
      ok: true,
      headers: new Headers({ "content-type": "font/woff2" }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as Response);
  });
}

function fakeSettingsRuntime(fontFamily: AppFontFamily = "system"): SettingsRuntime {
  return {
    health: vi.fn(),
    getSettings: vi.fn().mockResolvedValue(settingsResponse(fontFamily)),
    saveSettings: vi.fn(),
    saveAppearanceSettings: vi.fn(async (appearance) => settingsResponse(appearance.font_family)),
  } as unknown as SettingsRuntime;
}

function settingsResponse(fontFamily: AppFontFamily) {
  return {
    model: {
      base_url: "https://api.example/v1",
      model: "qwen-coder",
      timeout_seconds: 60,
      api_key_set: true,
      api_key_preview: "sk-***",
    },
    appearance: {
      font_family: fontFamily,
    },
  };
}

describe("FontProvider", () => {
  beforeEach(() => {
    installIndexedDbMock();
    localStorage.clear();
    indexedDB.deleteDatabase("keydex-font-cache");
    document.documentElement.removeAttribute("style");
    document.getElementById("keydex-custom-font-face")?.remove();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:font"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("keeps the system font by default without downloading assets", () => {
    renderProvider({ children: <FontHarness /> });

    expect(screen.getByTestId("family").textContent).toBe("system");
    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(screen.getByTestId("cached-maple").textContent).toBe("undefined");
    expect(screen.getByTestId("cached-jetbrains").textContent).toBe("undefined");
    expect(fetch).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toBe("");
  });

  it("clears removed local font selections back to system", () => {
    localStorage.setItem("keydex.font.family.v1", "segoe-ui");

    renderProvider({ children: <FontHarness /> });

    expect(screen.getByTestId("family").textContent).toBe("system");
    expect(localStorage.getItem("keydex.font.family.v1")).toBe("system");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("downloads Maple Mono CN only after the user selects it", async () => {
    mockSuccessfulFontDownload();
    const settingsRuntime = fakeSettingsRuntime();

    renderProvider({ children: <FontHarness />, settingsRuntime });
    fireEvent.click(screen.getByRole("button", { name: "Maple Mono" }));

    await waitFor(() => expect(screen.getByTestId("family").textContent).toBe("maple-mono"));
    expect(fetch).toHaveBeenCalledTimes(8);
    expect(screen.getByTestId("cached-maple").textContent).toBe("true");
    expect(screen.getByTestId("progress").textContent).toBe("36447552/36447552/100");
    expect(localStorage.getItem("keydex.font.family.v1")).toBe("maple-mono");
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toContain("Maple Mono CN");
    expect(document.documentElement.style.getPropertyValue("--font-reading")).toContain("Maple Mono CN");
    expect(document.documentElement.style.getPropertyValue("--font-mono")).toContain("Maple Mono CN");
    expect(document.getElementById("keydex-custom-font-face")?.textContent).toContain('url("blob:font")');
    expect(settingsRuntime.saveAppearanceSettings).toHaveBeenCalledWith({ font_family: "maple-mono" });
  });

  it("downloads JetBrains Mono only after the user selects it", async () => {
    mockSuccessfulFontDownload();
    const settingsRuntime = fakeSettingsRuntime();

    renderProvider({ children: <FontHarness />, settingsRuntime });
    fireEvent.click(screen.getByRole("button", { name: "JetBrains Mono" }));

    await waitFor(() => expect(screen.getByTestId("family").textContent).toBe("jetbrains-mono"));
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(screen.getByTestId("cached-jetbrains").textContent).toBe("true");
    expect(screen.getByTestId("progress").textContent).toBe("111702/111702/100");
    expect(localStorage.getItem("keydex.font.family.v1")).toBe("jetbrains-mono");
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toContain("JetBrains Mono");
    expect(document.documentElement.style.getPropertyValue("--font-reading")).toContain("JetBrains Mono");
    expect(document.documentElement.style.getPropertyValue("--font-mono")).toContain("JetBrains Mono");
    expect(settingsRuntime.saveAppearanceSettings).toHaveBeenCalledWith({ font_family: "jetbrains-mono" });
  });

  it("returns to the original font tokens when system font is selected", async () => {
    mockSuccessfulFontDownload();

    renderProvider({ children: <FontHarness /> });
    fireEvent.click(screen.getByRole("button", { name: "Maple Mono" }));
    await waitFor(() => expect(screen.getByTestId("family").textContent).toBe("maple-mono"));

    fireEvent.click(screen.getByRole("button", { name: "系统默认" }));

    expect(screen.getByTestId("family").textContent).toBe("system");
    expect(screen.getByTestId("cached-maple").textContent).toBe("true");
    expect(localStorage.getItem("keydex.font.family.v1")).toBe("system");
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--font-reading")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--font-mono")).toBe("");
  });

  it("loads the saved font selection from backend settings", async () => {
    mockSuccessfulFontDownload();
    const settingsRuntime = fakeSettingsRuntime("maple-mono");

    renderProvider({ children: <FontHarness />, settingsRuntime });

    await waitFor(() => expect(screen.getByTestId("family").textContent).toBe("maple-mono"));
    expect(settingsRuntime.getSettings).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(8);
    expect(localStorage.getItem("keydex.font.family.v1")).toBe("maple-mono");
  });

  it("persists the system font selection to backend settings", async () => {
    mockSuccessfulFontDownload();
    const settingsRuntime = fakeSettingsRuntime();

    renderProvider({ children: <FontHarness />, settingsRuntime });
    fireEvent.click(screen.getByRole("button", { name: "Maple Mono" }));
    await waitFor(() => expect(screen.getByTestId("family").textContent).toBe("maple-mono"));

    fireEvent.click(screen.getByRole("button", { name: "系统默认" }));

    expect(screen.getByTestId("family").textContent).toBe("system");
    await waitFor(() =>
      expect(settingsRuntime.saveAppearanceSettings).toHaveBeenLastCalledWith({ font_family: "system" }),
    );
  });

  it("reuses cached Maple Mono CN without starting another download", async () => {
    mockSuccessfulFontDownload();

    renderProvider({ children: <FontHarness /> });
    fireEvent.click(screen.getByRole("button", { name: "Maple Mono" }));
    await waitFor(() => expect(screen.getByTestId("family").textContent).toBe("maple-mono"));

    fireEvent.click(screen.getByRole("button", { name: "系统默认" }));
    fireEvent.click(screen.getByRole("button", { name: "Maple Mono" }));
    await waitFor(() => expect(screen.getByTestId("family").textContent).toBe("maple-mono"));

    expect(fetch).toHaveBeenCalledTimes(8);
    expect(screen.getByTestId("status").textContent).toBe("ready");
  });

  it("redownloads Maple Mono CN when the saved preference has no local cache", async () => {
    localStorage.setItem("keydex.font.family.v1", "maple-mono");
    mockSuccessfulFontDownload();

    renderProvider({ children: <FontHarness /> });

    await waitFor(() => expect(screen.getByTestId("family").textContent).toBe("maple-mono"));
    expect(fetch).toHaveBeenCalledTimes(8);
    expect(screen.getByTestId("cached-maple").textContent).toBe("true");
    expect(screen.getByTestId("progress").textContent).toBe("36447552/36447552/100");
  });
});
