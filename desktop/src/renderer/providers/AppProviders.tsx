import { HashRouter } from "react-router-dom";
import type { PropsWithChildren } from "react";

import { PreviewProvider } from "./PreviewProvider";
import { ThemeProvider } from "./ThemeProvider";
import { AgentSessionProvider } from "./AgentSessionProvider";
import { LayoutStateProvider } from "@/renderer/hooks/layout/LayoutStateProvider";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <LayoutStateProvider>
        <AgentSessionProvider>
          <PreviewProvider>
            <HashRouter>{children}</HashRouter>
          </PreviewProvider>
        </AgentSessionProvider>
      </LayoutStateProvider>
    </ThemeProvider>
  );
}
