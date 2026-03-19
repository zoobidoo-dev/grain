import { describe, expect, it } from "vitest";
import { normalizeVoiceTranscriptionLanguage } from "./voice-settings";

describe("normalizeVoiceTranscriptionLanguage", () => {
  it("normalizes locale-style codes to base language codes", () => {
    expect(normalizeVoiceTranscriptionLanguage("en-US")).toBe("en");
    expect(normalizeVoiceTranscriptionLanguage("hi-IN")).toBe("hi");
    expect(normalizeVoiceTranscriptionLanguage("pt_BR")).toBe("pt");
  });

  it("falls back to en when the input is empty", () => {
    expect(normalizeVoiceTranscriptionLanguage("")).toBe("en");
    expect(normalizeVoiceTranscriptionLanguage("   ")).toBe("en");
  });
});
