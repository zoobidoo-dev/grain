import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "./browser-storage";

export const VOICE_API_KEY_STORAGE_KEY = "grain:voice-openai-api-key";
export const VOICE_API_KEY_EVENT = "grain:voice-api-key-updated";
export const VOICE_LANGUAGE_STORAGE_KEY = "grain:voice-language";
export const VOICE_LANGUAGE_EVENT = "grain:voice-language-updated";

export function getStoredVoiceApiKey() {
  return readLocalStorage(VOICE_API_KEY_STORAGE_KEY) ?? "";
}

export function setStoredVoiceApiKey(value: string) {
  if (typeof window === "undefined") return;
  if (value.trim()) {
    writeLocalStorage(VOICE_API_KEY_STORAGE_KEY, value.trim());
  } else {
    removeLocalStorage(VOICE_API_KEY_STORAGE_KEY);
  }
  window.dispatchEvent(new Event(VOICE_API_KEY_EVENT));
}

export function maskApiKey(value: string) {
  if (!value) return "Not configured";
  if (value.length <= 10) return "Saved";
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

export function getStoredVoiceLanguage() {
  return readLocalStorage(VOICE_LANGUAGE_STORAGE_KEY) ?? "en-US";
}

export function normalizeVoiceTranscriptionLanguage(value: string) {
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) return "en";
  return normalized.split("-")[0] || "en";
}

export function setStoredVoiceLanguage(value: string) {
  if (typeof window === "undefined") return;
  const nextValue = value.trim() || "en-US";
  writeLocalStorage(VOICE_LANGUAGE_STORAGE_KEY, nextValue);
  window.dispatchEvent(new Event(VOICE_LANGUAGE_EVENT));
}
