import { HashRouter } from "react-router-dom";
import type { PropsWithChildren } from "react";

import { PreviewProvider } from "./PreviewProvider";
import { ThemeProvider } from "./ThemeProvider";
import { FontProvider } from "./FontProvider";
import { AgentSessionProvider } from "./AgentSessionProvider";
import { NotificationProvider } from "./NotificationProvider";
import { RuntimeConnectionProvider, type RuntimeConnectionProviderProps } from "./RuntimeConnectionProvider";
import { LayoutStateProvider } from "@/renderer/hooks/layout/LayoutStateProvider";
import { runtimeBridge, type RuntimeBridge } from "@/runtime";

export interface AppProvidersProps extends PropsWithChildren {
  runtime?: RuntimeBridge;
  runtimeConnection?: Omit<RuntimeConnectionProviderProps, "children" | "runtime">;
}

export function AppProviders({
  children,
  runtime = runtimeBridge,
  runtimeConnection,
}: AppProvidersProps) {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <LayoutStateProvider>
          <RuntimeConnectionProvider runtime={runtime} {...runtimeConnection}>
            <FontProvider>
              <AgentSessionProvider runtime={runtime}>
                <PreviewProvider>
                  <HashRouter>{children}</HashRouter>
                </PreviewProvider>
              </AgentSessionProvider>
            </FontProvider>
          </RuntimeConnectionProvider>
        </LayoutStateProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
