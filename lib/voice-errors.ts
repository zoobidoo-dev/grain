export function formatRealtimeVoiceError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const payload = error as { message?: unknown; error?: unknown };
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
    if (payload.error instanceof Error) return payload.error.message;
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
    if (payload.error && typeof payload.error === "object") {
      const nested = payload.error as { message?: unknown };
      if (typeof nested.message === "string" && nested.message.trim()) {
        return nested.message;
      }
    }
  }
  return "Realtime voice session failed.";
}
