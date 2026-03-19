"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/app/components/PageHeader";
import { TransactionForm } from "@/app/components/transactions/TransactionForm";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import { addTransaction, getCategories, getWallets } from "@/lib/db";
import { parseTransactionFromMessage } from "@/lib/message-parser";
import type { Category, Wallet } from "@/lib/types";

export default function AddTransactionPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageDraft, setMessageDraft] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [manualInitialValues, setManualInitialValues] = useState<{
    sourceText?: string;
    amount?: string;
    createdAt?: string;
    note?: string;
    type?: "expense" | "income";
  }>({});
  const router = useRouter();
  const searchParams = useSearchParams();
  const sharedMessage = useMemo(
    () =>
      [
        searchParams.get("shareTitle"),
        searchParams.get("shareText"),
        searchParams.get("shareUrl"),
      ]
        .filter(Boolean)
        .join("\n")
        .trim(),
    [searchParams],
  );
  const sharedImport = useMemo(
    () => (sharedMessage ? parseTransactionFromMessage(sharedMessage) : null),
    [sharedMessage],
  );
  const initialValues = manualInitialValues.sourceText
    ? manualInitialValues
    : {
        amount: sharedImport?.amount,
        createdAt: sharedImport?.createdAt,
        note: sharedImport?.note,
        type: sharedImport?.type,
      };
  const effectiveMessageDraft = messageDraft || sharedImport?.sourceText || "";

  useEffect(() => {
    Promise.all([getCategories(), getWallets()])
      .then(([categoryRows, walletRows]) => {
        setCategories(categoryRows);
        setWallets(walletRows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function importMessageText() {
    const parsed = parseTransactionFromMessage(effectiveMessageDraft);
    if (!parsed.sourceText) {
      setImportStatus("Paste a transaction message first.");
      return;
    }

    setManualInitialValues({
      sourceText: parsed.sourceText,
      amount: parsed.amount,
      createdAt: parsed.createdAt,
      note: parsed.note,
      type: parsed.type,
    });
    setImportStatus(
      parsed.amount
        ? "Popup updated from the pasted message."
        : "Message captured, but the amount was not detected.",
    );
    setFormVersion((current) => current + 1);
  }

  return (
    <main>
      <PageHeader
        title="New Transaction"
        subtitle="Quick Entry"
        actions={
          <Link href="/transactions">
            <Button variant="secondary" className="text-xs">
              History
            </Button>
          </Link>
        }
      />

      {loading ? (
        <p className="muted text-sm">Loading form...</p>
      ) : (
        <Modal
          open
          onClose={() => router.push("/")}
          title="New Transaction"
          subtitle="Quick Entry"
        >
          <div className="mb-4 space-y-2">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Import From Message
              </span>
              <textarea
                value={effectiveMessageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                placeholder="Paste or share your bank/SMS message here"
                className="min-h-24 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[rgba(255,255,255,0.55)] matrix-label"
              />
            </label>
            <Button variant="secondary" className="w-full" onClick={importMessageText}>
              Parse Message
            </Button>
            <p className="text-xs text-[var(--muted)]">
              On Android, install the PWA and use the phone&apos;s Share action from the
              SMS app to open this popup with prefilled values.
            </p>
            {!importStatus && sharedImport ? (
              <p className="text-sm text-[var(--muted)]">
                {sharedImport.amount
                  ? "Shared message detected. Amount, note, and date/time were prefilled."
                  : "Shared message detected. Amount was not found, so fill it manually."}
              </p>
            ) : null}
            {importStatus ? (
              <p className="text-sm text-[var(--muted)]">{importStatus}</p>
            ) : null}
          </div>
          <TransactionForm
            key={`new-transaction-form-${formVersion}`}
            categories={categories}
            wallets={wallets}
            initialValues={initialValues}
            submitLabel="Save Transaction"
            onSubmit={async (values) => {
              await addTransaction(values);
              router.push("/");
            }}
          />
        </Modal>
      )}
    </main>
  );
}
