import type { ReactNode } from "react";
import { VoiceAssistant } from "@/app/components/voice/VoiceAssistant";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      {children}
      <VoiceAssistant />
    </div>
  );
}
