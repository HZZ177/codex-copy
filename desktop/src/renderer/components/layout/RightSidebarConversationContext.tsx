import { createContext, useContext } from "react";

import type { RuntimeBridge } from "@/runtime";
import type { AgentSession } from "@/types/protocol";

export interface OpenRightSidebarConversationRequest {
  session: AgentSession;
  sourceSessionId?: string | null;
  title?: string | null;
}

export interface OpenBtwConversationRequest {
  sessionId: string;
  runtime: RuntimeBridge;
}

export interface RightSidebarConversationContextValue {
  openConversationPanel: (request: OpenRightSidebarConversationRequest) => void;
  openBtwConversationFromSession: (request: OpenBtwConversationRequest) => Promise<AgentSession | null>;
}

export const RightSidebarConversationContext = createContext<RightSidebarConversationContextValue | null>(null);

export function useOptionalRightSidebarConversation() {
  return useContext(RightSidebarConversationContext);
}
