"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Input } from "@/app/components/ui/Input";
import { Modal } from "@/app/components/ui/Modal";
import { Select } from "@/app/components/ui/Select";
import { ONBOARDING_START_EVENT } from "@/lib/constants";
import {
  addTransactions,
  exportData,
  getCategories,
  getPreferences,
  getWallets,
  importData,
  resetData,
  updatePreferences,
} from "@/lib/db";
import {
  parseStatementFile,
  StatementPasswordError,
  type ParsedStatementRow,
} from "@/lib/statement-import";
import {
  getStoredVoiceApiKey,
  getStoredVoiceLanguage,
  maskApiKey,
  setStoredVoiceApiKey,
  setStoredVoiceLanguage,
} from "@/lib/voice-settings";
import type { Category, ExportPayload, Preferences, Wallet } from "@/lib/types";

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<Preferences>({
    id: "prefs",
    currency: "USD",
    locale: "en-US",
  });
  const [status, setStatus] = useState("");
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [statementRows, setStatementRows] = useState<ParsedStatementRow[]>([]);
  const [statementWarnings, setStatementWarnings] = useState<string[]>([]);
  const [statementFileName, setStatementFileName] = useState("");
  const [statementWalletId, setStatementWalletId] = useState("");
  const [statementCategoryId, setStatementCategoryId] = useState("other");
  const [statementImporting, setStatementImporting] = useState(false);
  const [pendingStatementFile, setPendingStatementFile] = useState<File | null>(null);
  const [statementPassword, setStatementPassword] = useState("");
  const [statementPasswordError, setStatementPasswordError] = useState("");
  const [showStatementPasswordModal, setShowStatementPasswordModal] = useState(false);
  const [voiceApiKeyInput, setVoiceApiKeyInput] = useState("");
  const [savedVoiceApiKeyMask, setSavedVoiceApiKeyMask] = useState("Not configured");
  const [voiceLanguage, setVoiceLanguage] = useState("en-US");

  useEffect(() => {
    Promise.all([getPreferences(), getWallets(), getCategories()])
      .then(([prefs, walletRows, categoryRows]) => {
        setPreferences(prefs);
        setWallets(walletRows);
        setCategories(categoryRows);
        setStatementWalletId(prefs.defaultWalletId ?? walletRows[0]?.id ?? "");
        setSavedVoiceApiKeyMask(maskApiKey(getStoredVoiceApiKey()));
        setVoiceLanguage(getStoredVoiceLanguage());
      })
      .catch(() => undefined);
  }, []);

  async function handleStatementFile(file: File, password?: string) {
    setStatus("");
    try {
      const parsed = await parseStatementFile(file, password);
      setStatementRows(parsed.rows);
      setStatementWarnings(parsed.warnings);
      setStatementFileName(file.name);
      setPendingStatementFile(null);
      setStatementPassword("");
      setStatementPasswordError("");
      setShowStatementPasswordModal(false);
      setStatus(
        parsed.rows.length
          ? `Detected ${parsed.rows.length} transactions from ${file.name}. Review and import them below.`
          : `No transactions detected in ${file.name}.`,
      );
    } catch (error) {
      if (error instanceof StatementPasswordError) {
        setPendingStatementFile(file);
        setStatementFileName(file.name);
        setStatementRows([]);
        setStatementWarnings([]);
        setStatementPasswordError(error.message);
        setShowStatementPasswordModal(true);
        return;
      }
      setStatementRows([]);
      setStatementWarnings([]);
      setStatementFileName("");
      setStatus(
        error instanceof Error ? error.message : "Statement import failed.",
      );
    }
  }

  return (
    <main>
      <PageHeader title="Settings" subtitle="App Preferences" />

      <section className="space-y-4">
        <Card className="space-y-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Currency & Locale
          </p>
          <p className="text-sm muted">
            {preferences.currency} • {preferences.locale}
          </p>
          <Button
            className="w-full"
            onClick={() => {
              setShowPreferencesModal(true);
              setStatus("");
            }}
          >
            Edit Preferences
          </Button>
        </Card>

        <Card className="space-y-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Categories
          </p>
          <p className="text-sm muted">
            Add, edit, archive, and remove custom spending categories.
          </p>
          <Link href="/categories">
            <Button variant="secondary" className="w-full">
              Manage Categories
            </Button>
          </Link>
        </Card>

        <Card className="space-y-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Onboarding
          </p>
          <p className="text-sm muted">
            Replay the guided walkthrough to review every module and navigation
            path.
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              window.dispatchEvent(new Event(ONBOARDING_START_EVENT));
            }}
          >
            Replay Onboarding
          </Button>
        </Card>

        <Card className="space-y-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Voice Assistant Key
          </p>
          <p className="text-sm muted">
            Paste your own OpenAI API key to use the voice assistant from this browser only.
          </p>
          <p className="text-xs muted">Current: {savedVoiceApiKeyMask}</p>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              OpenAI API Key
            </span>
            <Input
              type="password"
              value={voiceApiKeyInput}
              onChange={(event) => setVoiceApiKeyInput(event.target.value)}
              placeholder="sk-proj-..."
            />
          </label>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <Button
              className="w-full"
              onClick={() => {
                setStoredVoiceApiKey(voiceApiKeyInput);
                setSavedVoiceApiKeyMask(maskApiKey(getStoredVoiceApiKey()));
                setVoiceApiKeyInput("");
                setStatus("Voice assistant key saved in this browser.");
              }}
            >
              Save Voice Key
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setStoredVoiceApiKey("");
                setSavedVoiceApiKeyMask(maskApiKey(""));
                setVoiceApiKeyInput("");
                setStatus("Voice assistant key removed from this browser.");
              }}
            >
              Remove Voice Key
            </Button>
          </div>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Voice Language
            </span>
            <Input
              value={voiceLanguage}
              onChange={(event) => setVoiceLanguage(event.target.value)}
              placeholder="en-US or hi-IN"
            />
          </label>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setStoredVoiceLanguage(voiceLanguage);
              setStatus(`Voice language saved as ${voiceLanguage || "en-US"}.`);
            }}
          >
            Save Voice Language
          </Button>
        </Card>

        <Card className="space-y-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Statement Import
          </p>
          <p className="text-sm muted">
            Upload bank or card statements in PDF, CSV, XLS, or XLSX format to import
            back-dated transactions into history.
          </p>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Statement File
            </span>
            <input
              type="file"
              accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                await handleStatementFile(file);
              }}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Import Into Wallet
            </span>
            <Select
              value={statementWalletId}
              onChange={setStatementWalletId}
              options={wallets.map((wallet) => ({
                value: wallet.id,
                label: wallet.name,
              }))}
              className="text-sm"
              ariaLabel="Statement wallet"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Default Category
            </span>
            <Select
              value={statementCategoryId}
              onChange={setStatementCategoryId}
              options={categories
                .filter((category) => !category.archived)
                .map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
              className="text-sm"
              ariaLabel="Statement category"
            />
          </label>

          {statementFileName ? (
            <div className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Preview
              </p>
              <p className="text-sm muted">
                {statementFileName} • {statementRows.length} detected rows
              </p>
              {statementWarnings.slice(0, 3).map((warning) => (
                <p key={warning} className="text-xs text-[var(--muted)]">
                  {warning}
                </p>
              ))}
              <div className="space-y-2">
                {statementRows.slice(0, 5).map((row, index) => (
                  <div
                    key={`${row.createdAt}-${row.amount}-${index}`}
                    className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2"
                  >
                    <p className="text-sm matrix-label">{row.description}</p>
                    <p className="text-xs muted">
                      {row.createdAt.slice(0, 10)} • {row.type} • {row.amount}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <Button
            className="w-full"
            disabled={!statementRows.length || !statementWalletId || statementImporting}
            onClick={async () => {
              setStatementImporting(true);
              try {
                await addTransactions(
                  statementRows.map((row) => ({
                    amount: row.amount,
                    type: row.type,
                    categoryId: statementCategoryId,
                    walletId: statementWalletId,
                    createdAt: row.createdAt,
                    note: row.description,
                  })),
                );
                setStatus(
                  `${statementRows.length} transactions imported from ${statementFileName}. View them in History.`,
                );
                setStatementRows([]);
                setStatementWarnings([]);
                setStatementFileName("");
              } catch {
                setStatus("Statement import failed while saving transactions.");
              } finally {
                setStatementImporting(false);
              }
            }}
          >
            {statementImporting ? "Importing..." : "Import Statement Transactions"}
          </Button>
        </Card>

        <Card className="space-y-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Backup
          </p>
          <Button
            className="w-full"
            onClick={async () => {
              const payload = await exportData();
              const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `grain-backup-${new Date().toISOString().slice(0, 10)}.json`;
              anchor.click();
              URL.revokeObjectURL(url);
              setStatus("Backup exported.");
            }}
          >
            Export JSON
          </Button>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Import JSON
            </span>
            <input
              type="file"
              accept="application/json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  const payload = JSON.parse(
                    await file.text(),
                  ) as ExportPayload;
                  await importData(payload);
                  setStatus("Backup imported.");
                } catch {
                  setStatus("Import failed. Check JSON format.");
                }
              }}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
            />
          </label>
        </Card>

        <Card className="space-y-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Danger Zone
          </p>
          <Button
            variant="danger"
            className="w-full"
            onClick={async () => {
              const ok = window.confirm(
                "Reset all local data? This cannot be undone.",
              );
              if (!ok) return;
              await resetData();
              setStatus("All data reset.");
            }}
          >
            Reset Local Data
          </Button>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            PWA Install
          </p>
          <p className="mt-2 text-sm muted">
            Use your browser menu and choose &quot;Add to Home Screen&quot; or
            &quot;Install App&quot; for standalone mode.
          </p>
        </Card>

        {status ? <p className="text-sm">{status}</p> : null}
      </section>

      <Modal
        open={showPreferencesModal}
        onClose={() => setShowPreferencesModal(false)}
        title="Preferences"
        subtitle="Currency and locale"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Currency
            </span>
            <Input
              value={preferences.currency}
              maxLength={3}
              onChange={(event) =>
                setPreferences((prev) => ({
                  ...prev,
                  currency: event.target.value.toUpperCase(),
                }))
              }
              placeholder="USD"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Locale
            </span>
            <Input
              value={preferences.locale}
              onChange={(event) =>
                setPreferences((prev) => ({ ...prev, locale: event.target.value }))
              }
              placeholder="en-US"
            />
          </label>

          <Button
            className="w-full"
            onClick={async () => {
              const next = await updatePreferences(preferences);
              setPreferences(next);
              setShowPreferencesModal(false);
              setStatus("Preferences saved.");
            }}
          >
            Save Preferences
          </Button>
        </div>
      </Modal>

      <Modal
        open={showStatementPasswordModal}
        onClose={() => {
          setShowStatementPasswordModal(false);
          setPendingStatementFile(null);
          setStatementPassword("");
          setStatementPasswordError("");
        }}
        title="Statement Password"
        subtitle={statementFileName || "Protected file"}
      >
        <div className="space-y-3">
          <p className="text-sm muted">
            This statement is password protected. Enter the file password to continue.
          </p>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Password
            </span>
            <Input
              type="password"
              value={statementPassword}
              onChange={(event) => {
                setStatementPassword(event.target.value);
                setStatementPasswordError("");
              }}
              placeholder="Enter statement password"
            />
          </label>

          {statementPasswordError ? (
            <p className="text-sm text-[var(--danger)]">{statementPasswordError}</p>
          ) : null}

          <Button
            className="w-full"
            onClick={async () => {
              if (!pendingStatementFile) return;
              await handleStatementFile(pendingStatementFile, statementPassword);
            }}
          >
            Unlock Statement
          </Button>
        </div>
      </Modal>
    </main>
  );
}
