"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Modal } from "@/app/components/ui/Modal";
import {
  addTransaction,
  getCategories,
  getPreferences,
  getTransactions,
  getWallets,
} from "@/lib/db";
import { monthKey, summarizeTransactions } from "@/lib/finance";
import {
  getStoredVoiceApiKey,
  getStoredVoiceLanguage,
  VOICE_LANGUAGE_EVENT,
  VOICE_API_KEY_EVENT,
} from "@/lib/voice-settings";
import type { TransactionType } from "@/lib/types";

type VoiceAgentResponse = {
  reply: string;
  updates?: {
    amount?: number;
    type?: TransactionType;
    categoryId?: string;
    walletId?: string;
    createdAt?: string;
    note?: string;
  };
  requiresConfirmation?: boolean;
  shouldSave?: boolean;
  clearDraft?: boolean;
  navigatePath?: string;
};

type PendingTransactionDraft = {
  amount?: number;
  type?: TransactionType;
  categoryId?: string;
  walletId?: string;
  createdAt?: string;
  note?: string;
  awaitingConfirmation?: boolean;
};

type AssistantContext = Awaited<ReturnType<typeof buildAssistantContext>>;

type TranscriptEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type SpeechRecognitionResultLike = {
  readonly 0: { readonly transcript: string };
};

type SpeechRecognitionEventLike = Event & {
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const browserWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

async function buildAssistantContext(pathname: string, pendingTransaction: PendingTransactionDraft) {
  const [transactions, categories, wallets, preferences] = await Promise.all([
    getTransactions(),
    getCategories(),
    getWallets(),
    getPreferences(),
  ]);

  const currentMonth = monthKey();
  const monthlySummary = summarizeTransactions(
    transactions.filter((item) => item.createdAt.slice(0, 7) === currentMonth),
  );
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const walletMap = new Map(wallets.map((wallet) => [wallet.id, wallet.name]));

  return {
    currentDate: new Date().toISOString(),
    currentPath: pathname,
    preferences: {
      locale: preferences.locale,
      currency: preferences.currency,
    },
    categories: categories
      .filter((category) => !category.archived)
      .map((category) => ({ id: category.id, name: category.name })),
    wallets: wallets.map((wallet) => ({
      id: wallet.id,
      name: wallet.name,
      type: wallet.type,
    })),
    monthlySummary,
    pendingTransaction,
    recentTransactions: transactions.slice(0, 25).map((transaction) => ({
      createdAt: transaction.createdAt,
      amount: transaction.amount,
      type: transaction.type,
      category: categoryMap.get(transaction.categoryId) ?? "Unknown",
      wallet: walletMap.get(transaction.walletId) ?? "Unknown",
      note: transaction.note,
    })),
  };
}

function yesIntent(text: string) {
  return /^(yes|yeah|yep|haan|han|ha|ok|okay|save|confirm|kar do|haan save|yes save)\b/i.test(
    text.trim(),
  );
}

function noIntent(text: string) {
  return /^(no|nah|cancel|stop|mat karo|don't save|dont save)\b/i.test(text.trim());
}

function missingDraftFields(
  draft: PendingTransactionDraft,
  context: AssistantContext,
) {
  const missing: string[] = [];
  if (!draft.amount) missing.push("amount");
  if (!draft.type) missing.push("type");
  if (!draft.categoryId) missing.push("category");
  if (!draft.walletId) missing.push("wallet");
  if (!draft.createdAt) missing.push("date");

  if (missing.length === 0) return [];

  return missing.map((field) => {
    if (field === "wallet") {
      const walletNames = context.wallets.slice(0, 5).map((wallet) => wallet.name).join(", ");
      return `wallet (${walletNames})`;
    }
    if (field === "category") {
      const categoryNames = context.categories
        .slice(0, 5)
        .map((category) => category.name)
        .join(", ");
      return `category (${categoryNames})`;
    }
    return field;
  });
}

function formatDraftSummary(draft: PendingTransactionDraft, context: AssistantContext) {
  const categoryName =
    context.categories.find((category) => category.id === draft.categoryId)?.name ?? "Unknown";
  const walletName =
    context.wallets.find((wallet) => wallet.id === draft.walletId)?.name ?? "Unknown";
  const dateText = draft.createdAt ? new Date(draft.createdAt).toLocaleDateString() : "today";
  return `${draft.type ?? "transaction"} ${draft.amount ?? ""} in ${categoryName} from ${walletName} on ${dateText}`;
}

function validateDraft(
  draft: PendingTransactionDraft,
  context: AssistantContext,
) {
  if (!draft.amount || draft.amount <= 0) return false;
  if (draft.type !== "income" && draft.type !== "expense") return false;
  if (!draft.categoryId || !context.categories.some((item) => item.id === draft.categoryId)) {
    return false;
  }
  if (!draft.walletId || !context.wallets.some((item) => item.id === draft.walletId)) {
    return false;
  }
  return true;
}

export function VoiceAssistant() {
  const router = useRouter();
  const pathname = usePathname();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [apiKeyAvailable, setApiKeyAvailable] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState("en-US");
  const [pendingTransaction, setPendingTransaction] = useState<PendingTransactionDraft>({});
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const recognitionSupported = Boolean(getSpeechRecognitionConstructor());
  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    function refreshApiKeyState() {
      setApiKeyAvailable(Boolean(getStoredVoiceApiKey()));
    }

    function refreshVoiceLanguage() {
      setVoiceLanguage(getStoredVoiceLanguage());
    }

    refreshApiKeyState();
    refreshVoiceLanguage();
    window.addEventListener(VOICE_API_KEY_EVENT, refreshApiKeyState);
    window.addEventListener(VOICE_LANGUAGE_EVENT, refreshVoiceLanguage);
    window.addEventListener("storage", refreshApiKeyState);
    return () => {
      window.removeEventListener(VOICE_API_KEY_EVENT, refreshApiKeyState);
      window.removeEventListener(VOICE_LANGUAGE_EVENT, refreshVoiceLanguage);
      window.removeEventListener("storage", refreshApiKeyState);
    };
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function speak(text: string) {
    if (!speechSupported || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }

  function mergeDraft(
    current: PendingTransactionDraft,
    updates: VoiceAgentResponse["updates"],
  ): PendingTransactionDraft {
    if (!updates) return current;
    return {
      ...current,
      ...Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined),
      ),
    };
  }

  async function sendToAgent(text: string) {
    const utterance = text.trim();
    if (!utterance) return;
    const apiKey = getStoredVoiceApiKey();
    if (!apiKey) {
      setError("Add your OpenAI API key in Settings to use voice assistant.");
      return;
    }

    setError("");
    setProcessing(true);
    setTranscript((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: utterance },
    ]);

    try {
      const context = await buildAssistantContext(pathname, pendingTransaction);

      if (pendingTransaction.awaitingConfirmation) {
        if (yesIntent(utterance)) {
          if (!validateDraft(pendingTransaction, context)) {
            throw new Error("Draft is incomplete. Complete the missing fields first.");
          }
          await addTransaction({
            amount: pendingTransaction.amount!,
            type: pendingTransaction.type!,
            categoryId: pendingTransaction.categoryId!,
            walletId: pendingTransaction.walletId!,
            createdAt: pendingTransaction.createdAt,
            note: pendingTransaction.note,
          });
          const reply = `Saved ${formatDraftSummary(pendingTransaction, context)}.`;
          setPendingTransaction({});
          setTranscript((current) => [
            ...current,
            { id: crypto.randomUUID(), role: "assistant", text: reply },
          ]);
          speak(reply);
          setDraft("");
          router.push("/transactions");
          return;
        }

        if (noIntent(utterance)) {
          const reply = "Okay, I did not save it. You can continue editing the draft.";
          setPendingTransaction((current) => ({
            ...current,
            awaitingConfirmation: false,
          }));
          setTranscript((current) => [
            ...current,
            { id: crypto.randomUUID(), role: "assistant", text: reply },
          ]);
          speak(reply);
          return;
        }
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          response_format: { type: "json_object" },
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                'You are Grain Voice, a finance voice assistant inside a personal finance tracker. Understand broken English, pauses, partial sentences, and user corrections. Maintain and fill a transaction draft instead of starting over each turn. Reply in the same language as the user when possible. Return ONLY valid JSON with this shape: {"reply": string, "updates"?: {"amount"?: number, "type"?: "income"|"expense", "categoryId"?: string, "walletId"?: string, "createdAt"?: string, "note"?: string}, "requiresConfirmation"?: boolean, "shouldSave"?: boolean, "clearDraft"?: boolean, "navigatePath"?: string}. Use the provided category and wallet ids exactly. Ask only for missing fields. If the user corrects a previous field, overwrite it in updates. Save only after explicit confirmation or a very clear save intent.',
            },
            {
              role: "user",
              content: JSON.stringify({
                utterance,
                language: voiceLanguage,
                context,
                recentTranscript: transcript.slice(-6),
              }),
            },
          ],
        }),
      });
      const rawPayload = (await response.json()) as
        | VoiceAgentResponse
        | { error?: { message?: string } }
        | { choices?: Array<{ message?: { content?: string } }> };
      if (!response.ok) {
        const message =
          "error" in rawPayload && rawPayload.error?.message
            ? rawPayload.error.message
            : "Voice agent request failed.";
        throw new Error(message);
      }

      const payload =
        "choices" in rawPayload
          ? (JSON.parse(rawPayload.choices?.[0]?.message?.content ?? "{}") as VoiceAgentResponse)
          : (rawPayload as VoiceAgentResponse);

      const nextDraft = mergeDraft(pendingTransaction, payload.updates);
      const draftWithFlags = {
        ...nextDraft,
        awaitingConfirmation: payload.requiresConfirmation && validateDraft(nextDraft, context),
      };

      if (payload.clearDraft) {
        setPendingTransaction({});
      } else {
        setPendingTransaction(draftWithFlags);
      }

      if (payload.shouldSave && validateDraft(nextDraft, context)) {
        await addTransaction({
          amount: nextDraft.amount!,
          type: nextDraft.type!,
          categoryId: nextDraft.categoryId!,
          walletId: nextDraft.walletId!,
          createdAt: nextDraft.createdAt,
          note: nextDraft.note,
        });
        setPendingTransaction({});
      } else if (!payload.shouldSave && !payload.clearDraft) {
        const missing = missingDraftFields(draftWithFlags, context);
        if (missing.length && payload.reply.trim().length < 6) {
          payload.reply = `I have some details. Tell me the missing ${missing.join(", ")}.`;
        } else if (
          validateDraft(draftWithFlags, context) &&
          !draftWithFlags.awaitingConfirmation &&
          !payload.navigatePath
        ) {
          draftWithFlags.awaitingConfirmation = true;
          setPendingTransaction(draftWithFlags);
          payload.reply = `I understood ${formatDraftSummary(draftWithFlags, context)}. Say yes to save or tell me what to change.`;
        }
      }

      if (payload.navigatePath) {
        router.push(payload.navigatePath);
      } else if (payload.shouldSave && validateDraft(nextDraft, context)) {
        router.push("/transactions");
      }

      setTranscript((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: payload.reply },
      ]);
      speak(payload.reply);
      setDraft("");
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Voice request failed.";
      setError(message);
      setTranscript((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: message },
      ]);
    } finally {
      setProcessing(false);
    }
  }

  function startListening() {
    const RecognitionConstructor = getSpeechRecognitionConstructor();
    if (!RecognitionConstructor) {
      setError("Speech recognition is not available in this browser.");
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new RecognitionConstructor();
    recognition.lang = voiceLanguage || "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const combined = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setDraft(combined);
      if (combined) {
        void sendToAgent(combined);
      }
    };
    recognition.onerror = (event) => {
      setError(event.error ? `Voice input failed: ${event.error}` : "Voice input failed.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    setError("");
    recognition.start();
  }

  return (
    <>
      <button
        type="button"
        className="voice-agent-trigger matrix-label"
        onClick={() => setOpen(true)}
        aria-label="Open voice assistant"
        title="Open voice assistant"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="square"
          strokeLinejoin="miter"
        >
          <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
          <path d="M7 11.5v.5a5 5 0 0 0 10 0v-.5" />
          <path d="M12 17v4" />
          <path d="M9 21h6" />
        </svg>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Voice Assistant"
        subtitle="Speak transactions, history, and insights"
      >
        <div className="space-y-3">
          <Card className="space-y-3 border-white/10">
            <p className="text-xs text-[var(--muted)]">
              Try: “Add expense 250 for food from Main wallet”, “Show March transactions”,
              or “Tell me this month spending”.
            </p>
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              <Button
                className="w-full"
                disabled={
                  listening || processing || !recognitionSupported || !apiKeyAvailable
                }
                onClick={startListening}
              >
                {listening ? "Listening..." : "Start Voice Input"}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                disabled={processing || !draft.trim()}
                onClick={() => void sendToAgent(draft)}
              >
                {processing ? "Thinking..." : "Send Typed Request"}
              </Button>
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type or speak a request"
              className="min-h-24 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[rgba(255,255,255,0.55)]"
            />
            {!recognitionSupported ? (
              <p className="text-xs text-[var(--muted)]">
                This browser does not support live microphone recognition. Typed fallback is available.
              </p>
            ) : null}
            {!apiKeyAvailable ? (
              <p className="text-xs text-[var(--muted)]">
                Add your own OpenAI API key in Settings to enable voice assistant on this browser.
              </p>
            ) : null}
            {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          </Card>

          <Card className="space-y-2">
            <p className="text-xs text-[var(--muted)]">Current Draft</p>
            <p className="text-sm">Amount: {pendingTransaction.amount ?? "Pending"}</p>
            <p className="text-sm">Type: {pendingTransaction.type ?? "Pending"}</p>
            <p className="text-sm">Category: {pendingTransaction.categoryId ?? "Pending"}</p>
            <p className="text-sm">Wallet: {pendingTransaction.walletId ?? "Pending"}</p>
            <p className="text-sm">Date: {pendingTransaction.createdAt ?? "Pending"}</p>
            <p className="text-sm">Note: {pendingTransaction.note ?? "Optional"}</p>
            {pendingTransaction.awaitingConfirmation ? (
              <p className="text-xs text-[var(--muted)]">
                Waiting for your confirmation before saving.
              </p>
            ) : null}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setPendingTransaction({})}
            >
              Clear Draft
            </Button>
          </Card>

          <div className="space-y-2">
            {transcript.length === 0 ? (
              <p className="text-sm muted">No conversation yet.</p>
            ) : (
              transcript.slice(-8).map((entry) => (
                <Card key={entry.id} className="space-y-1">
                  <p className="text-xs text-[var(--muted)]">
                    {entry.role === "user" ? "You" : "Assistant"}
                  </p>
                  <p className="text-sm">{entry.text}</p>
                </Card>
              ))
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
