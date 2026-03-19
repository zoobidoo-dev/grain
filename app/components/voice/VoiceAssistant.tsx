"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { z } from "zod";
import {
  RealtimeAgent,
  RealtimeSession,
  tool,
  utils,
  type RealtimeItem,
} from "@openai/agents/realtime";
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

type PendingTransactionDraft = {
  amount?: number;
  type?: TransactionType;
  categoryId?: string;
  walletId?: string;
  createdAt?: string;
  note?: string;
  awaitingConfirmation?: boolean;
};

type TranscriptEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type AssistantContext = Awaited<ReturnType<typeof buildAssistantContext>>;

function getRealtimeText(item: RealtimeItem) {
  if (item.type !== "message") return "";
  if (item.role === "assistant") {
    return (
      utils.getLastTextFromAudioOutputMessage(item) ??
      item.content
        .map((content) => {
          if ("text" in content) return content.text ?? "";
          if ("transcript" in content) return content.transcript ?? "";
          return "";
        })
        .join(" ")
        .trim()
    );
  }

  return item.content
    .map((content) => {
      if ("text" in content) return content.text ?? "";
      if ("transcript" in content) return content.transcript ?? "";
      return "";
    })
    .join(" ")
    .trim();
}

function isCompletedTranscriptMessage(item: RealtimeItem): item is Extract<
  RealtimeItem,
  { type: "message"; role: "user" | "assistant" }
> {
  return (
    item.type === "message" &&
    item.role !== "system" &&
    "status" in item &&
    item.status === "completed"
  );
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
      return `wallet (${context.wallets.slice(0, 5).map((wallet) => wallet.name).join(", ")})`;
    }
    if (field === "category") {
      return `category (${context.categories
        .slice(0, 5)
        .map((category) => category.name)
        .join(", ")})`;
    }
    return field;
  });
}

async function mintRealtimeClientSecret(apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: "gpt-realtime",
      },
    }),
  });

  const payload = (await response.json()) as { value?: string; error?: { message?: string } };
  if (!response.ok || !payload.value) {
    throw new Error(payload.error?.message ?? "Could not create Realtime client secret.");
  }
  return payload.value;
}

export function VoiceAssistant() {
  const router = useRouter();
  const pathname = usePathname();
  const sessionRef = useRef<RealtimeSession | null>(null);
  const sessionGenerationRef = useRef(0);
  const openRef = useRef(false);
  const pendingTransactionRef = useRef<PendingTransactionDraft>({});
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [apiKeyAvailable, setApiKeyAvailable] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState("en-US");
  const [pendingTransaction, setPendingTransaction] = useState<PendingTransactionDraft>({});
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    pendingTransactionRef.current = pendingTransaction;
  }, [pendingTransaction]);

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
      sessionGenerationRef.current += 1;
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, []);

  async function syncTranscriptFromHistory(history: RealtimeItem[]) {
    const nextTranscript: TranscriptEntry[] = [];
    for (const item of history.filter(isCompletedTranscriptMessage)) {
      const entry = {
        id: item.itemId,
        role: item.role === "assistant" ? "assistant" : "user",
        text: getRealtimeText(item).trim(),
      };
      if (!entry.text) continue;
      const previous = nextTranscript[nextTranscript.length - 1];
      if (previous && previous.role === entry.role && previous.text === entry.text) {
        continue;
      }
      nextTranscript.push(entry);
    }
    setTranscript(nextTranscript.slice(-10));
  }

  function teardownRealtimeSession(options?: { clearTranscript?: boolean; clearError?: boolean }) {
    sessionGenerationRef.current += 1;
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.close();
    setConnected(false);
    setProcessing(false);
    if (options?.clearTranscript ?? true) {
      setTranscript([]);
    }
    if (options?.clearError ?? true) {
      setError("");
    }
  }

  const connectRealtime = useCallback(async () => {
    if (sessionRef.current || !openRef.current) return;
    const sessionGeneration = ++sessionGenerationRef.current;
    const apiKey = getStoredVoiceApiKey();
    if (!apiKey) {
      setError("Add your OpenAI API key in Settings to use voice assistant.");
      return;
    }

    setProcessing(true);
    setError("");
    setConnected(false);

    let session: RealtimeSession | null = null;
    try {
      const initialContext = await buildAssistantContext(pathname, pendingTransactionRef.current);
      if (sessionGeneration !== sessionGenerationRef.current || !openRef.current) return;

      const updateDraftTool = tool({
        name: "update_transaction_draft",
        description:
          "Update any known transaction draft fields from the user's latest speech. Use this whenever the user provides or corrects amount, type, category, wallet, date, or note.",
        parameters: z.object({
          amount: z.number().positive().optional(),
          type: z.enum(["income", "expense"]).optional(),
          categoryId: z.string().optional(),
          walletId: z.string().optional(),
          createdAt: z.string().optional(),
          note: z.string().optional(),
          awaitingConfirmation: z.boolean().optional(),
          clearDraft: z.boolean().optional(),
        }),
        execute: async (input) => {
          if (input.clearDraft) {
            setPendingTransaction({});
            pendingTransactionRef.current = {};
            return "Transaction draft cleared.";
          }

          const nextDraft: PendingTransactionDraft = {
            ...pendingTransactionRef.current,
            ...Object.fromEntries(
              Object.entries(input).filter(([, value]) => value !== undefined),
            ),
          };
          delete (nextDraft as { clearDraft?: boolean }).clearDraft;
          const liveContext = await buildAssistantContext(pathname, nextDraft);
          const missing = missingDraftFields(nextDraft, liveContext);
          const updatedDraft: PendingTransactionDraft = {
            ...nextDraft,
            awaitingConfirmation: missing.length === 0 ? true : undefined,
          };
          if (!updatedDraft.awaitingConfirmation) {
            delete updatedDraft.awaitingConfirmation;
          }
          setPendingTransaction(updatedDraft);
          pendingTransactionRef.current = updatedDraft;
          return missing.length
            ? `Draft updated. Missing ${missing.join(", ")}.`
            : `Draft updated: ${formatDraftSummary(updatedDraft, liveContext)}.`;
        },
      });

      const getSnapshotTool = tool({
        name: "get_finance_snapshot",
        description:
          "Get current finance context, including categories, wallets, pending transaction draft, and current month summary before asking follow-up questions.",
        parameters: z.object({}),
        execute: async () => {
          const context = await buildAssistantContext(pathname, pendingTransactionRef.current);
          return JSON.stringify(context);
        },
      });

      const saveDraftTool = tool({
        name: "save_transaction_draft",
        description:
          "Save the current transaction draft only after the user explicitly confirms with yes, sure, okay, go ahead, save it, haan, or similar.",
        parameters: z.object({}),
        execute: async () => {
          const liveContext = await buildAssistantContext(pathname, pendingTransactionRef.current);
          const currentDraft = pendingTransactionRef.current;
          if (!validateDraft(currentDraft, liveContext)) {
            return `Cannot save yet. Missing ${missingDraftFields(currentDraft, liveContext).join(", ")}.`;
          }
          await addTransaction({
            amount: currentDraft.amount!,
            type: currentDraft.type!,
            categoryId: currentDraft.categoryId!,
            walletId: currentDraft.walletId!,
            createdAt: currentDraft.createdAt,
            note: currentDraft.note,
          });
          const summary = formatDraftSummary(currentDraft, liveContext);
          setPendingTransaction({});
          pendingTransactionRef.current = {};
          router.push("/transactions");
          return `Saved ${summary}.`;
        },
      });

      const navigateTool = tool({
        name: "navigate_app",
        description:
          "Navigate the app to a supported route after answering a history or insights request.",
        parameters: z.object({
          path: z.enum(["/", "/transactions", "/insights", "/budgets", "/settings"]),
        }),
        execute: async ({ path }) => {
          router.push(path);
          return `Navigated to ${path}.`;
        },
      });

      const agent = new RealtimeAgent({
        name: "Grain Voice",
        voice: "alloy",
        instructions: `You are Grain Voice, a production-quality finance voice assistant for a personal finance tracker.

You must handle:
- broken English
- pauses and fragmented speech
- mixed-language speech when possible
- follow-up answers without forgetting earlier draft values
- corrections like "not food, transport" or "not 200, 250"

Important rules:
- Always use tools when updating or saving the transaction draft.
- Call get_finance_snapshot whenever you need current context or draft state.
- Do not ask again for fields that are already present in the draft.
- Ask only for the missing fields.
- Save only after clear confirmation like yes, sure, okay, save it, go ahead, haan.
- If the user asks about history or insights, answer briefly and navigate when useful.
- Reply in the same language as the user when possible.

Available categories: ${initialContext.categories
          .map((category) => `${category.name} (${category.id})`)
          .join(", ")}
Available wallets: ${initialContext.wallets
          .map((wallet) => `${wallet.name} (${wallet.id})`)
          .join(", ")}
Current month summary: income ${initialContext.monthlySummary.income}, expenses ${initialContext.monthlySummary.expenses}, net ${initialContext.monthlySummary.net}.`,
        tools: [updateDraftTool, getSnapshotTool, saveDraftTool, navigateTool],
      });

      session = new RealtimeSession(agent, {
        model: "gpt-realtime",
        transport: "webrtc",
        config: {
          audio: {
            input: {
              transcription: {
                language: voiceLanguage,
                model: "gpt-4o-mini-transcribe",
              },
              turnDetection: {
                type: "server_vad",
                createResponse: true,
                interruptResponse: true,
                silenceDurationMs: 250,
              },
            },
            output: {
              voice: "alloy",
              speed: 1,
            },
          },
        },
      });

      sessionRef.current = session;

      const isCurrentSession = () =>
        sessionRef.current === session &&
        sessionGenerationRef.current === sessionGeneration &&
        openRef.current;

      session.on("history_updated", (history) => {
        if (!isCurrentSession()) return;
        void syncTranscriptFromHistory(history);
      });
      session.on("error", (nextError) => {
        if (!isCurrentSession()) return;
        teardownRealtimeSession({ clearTranscript: false, clearError: false });
        setError(
          nextError.error instanceof Error
            ? nextError.error.message
            : "Realtime voice session failed.",
        );
      });

      const clientSecret = await mintRealtimeClientSecret(apiKey);
      if (!isCurrentSession()) {
        session.close();
        return;
      }
      await session.connect({ apiKey: clientSecret, model: "gpt-realtime" });
      if (!isCurrentSession()) {
        session.close();
        return;
      }
      setConnected(true);
    } catch (nextError) {
      if (sessionGeneration === sessionGenerationRef.current) {
        setError(nextError instanceof Error ? nextError.message : "Could not start voice session.");
      }
      session?.close();
      sessionRef.current = null;
      setConnected(false);
    } finally {
      if (sessionGeneration === sessionGenerationRef.current) {
        setProcessing(false);
      }
    }
  }, [pathname, router, voiceLanguage]);

  const closeRealtime = useCallback(() => {
    teardownRealtimeSession({ clearTranscript: true, clearError: true });
  }, []);

  useEffect(() => {
    if (open) {
      void connectRealtime();
      return;
    }
    closeRealtime();
  }, [open, closeRealtime, connectRealtime]);

  async function sendTypedMessage() {
    const message = draft.trim();
    if (!message || !sessionRef.current) return;
    sessionRef.current.sendMessage(message);
    setDraft("");
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
        subtitle="Realtime speech for transactions, history, and insights"
      >
        <div className="space-y-3">
          <Card className="space-y-3 border-white/10">
            <p className="text-xs text-[var(--muted)]">
              Realtime voice is {connected ? "connected" : processing ? "connecting..." : error ? "failed" : "offline"}.
              The mic/audio session starts automatically when this popup opens.
            </p>
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              <Button
                className="w-full"
                disabled={!apiKeyAvailable || processing || connected}
                onClick={() => void connectRealtime()}
              >
                {processing ? "Connecting..." : connected ? "Connected" : error ? "Retry Voice" : "Start Realtime Voice"}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                disabled={!connected}
                onClick={closeRealtime}
              >
                Stop Voice
              </Button>
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Typed fallback while the Realtime session is open"
              className="min-h-24 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[rgba(255,255,255,0.55)]"
            />
            <Button
              variant="secondary"
              className="w-full"
              disabled={!connected || !draft.trim()}
              onClick={() => void sendTypedMessage()}
            >
              Send Typed Message
            </Button>
            {!apiKeyAvailable ? (
              <p className="text-xs text-[var(--muted)]">
                Add your own OpenAI API key in Settings to enable Realtime voice on this browser.
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
              onClick={() => {
                setPendingTransaction({});
                pendingTransactionRef.current = {};
              }}
            >
              Clear Draft
            </Button>
          </Card>

          <div className="space-y-2">
            {transcript.length === 0 ? (
              <p className="text-sm muted">No conversation yet.</p>
            ) : (
              transcript.map((entry) => (
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
