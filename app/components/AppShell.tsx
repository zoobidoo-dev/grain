import type { ReactNode } from "react";
import { ClientBoundary } from "@/app/components/ui/ClientBoundary";
import { VoiceAssistant } from "@/app/components/voice/VoiceAssistant";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      {children}
      <ClientBoundary label="VoiceAssistant">
        <VoiceAssistant />
      </ClientBoundary>
    </div>
  );
}
