import { describe, expect, it } from "vitest";
import { formatRealtimeVoiceError } from "./voice-errors";

describe("formatRealtimeVoiceError", () => {
  it("returns error messages from Error instances", () => {
    expect(formatRealtimeVoiceError(new Error("boom"))).toBe("boom");
  });

  it("returns messages from realtime error payloads", () => {
    expect(formatRealtimeVoiceError({ error: { message: "mic denied" } })).toBe("mic denied");
    expect(formatRealtimeVoiceError({ message: "network down" })).toBe("network down");
  });

  it("falls back to a generic message when the input is unusable", () => {
    expect(formatRealtimeVoiceError(null)).toBe("Realtime voice session failed.");
    expect(formatRealtimeVoiceError({})).toBe("Realtime voice session failed.");
  });
});
