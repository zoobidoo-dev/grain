"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Input } from "@/app/components/ui/Input";
import { Modal } from "@/app/components/ui/Modal";
import { Select } from "@/app/components/ui/Select";
import { SegmentedControl } from "@/app/components/ui/SegmentedControl";
import { addDebt, deleteDebt, getDebts, getPreferences, updateDebt } from "@/lib/db";
import { summarizeDebts } from "@/lib/finance";
import { dateTimeLocalValue, formatCurrency, formatDate } from "@/lib/format";
import type {
  Debt,
  DebtDirection,
  DebtKind,
  DebtStatus,
  InstitutionalDebtSubtype,
  Preferences,
} from "@/lib/types";

type DebtFormValues = {
  title: string;
  person: string;
  amount: string;
  kind: DebtKind;
  institutionalSubtype: InstitutionalDebtSubtype;
  direction: DebtDirection;
  status: DebtStatus;
  createdAt: string;
  dueAt: string;
  note: string;
};

const RECENT_LIMIT = 3;

const EMPTY_FORM: DebtFormValues = {
  title: "",
  person: "",
  amount: "",
  kind: "lent",
  institutionalSubtype: "loan",
  direction: "owed_to_me",
  status: "open",
  createdAt: "",
  dueAt: "",
  note: "",
};

function kindLabel(kind: DebtKind) {
  if (kind === "lent") return "Lent";
  if (kind === "borrowed") return "Borrowed";
  return "Custom";
}

function subtypeLabel(subtype?: InstitutionalDebtSubtype) {
  if (subtype === "loan") return "Loan";
  if (subtype === "credit_card") return "Credit Card";
  return "Other";
}

function directionLabel(direction: DebtDirection) {
  return direction === "owed_to_me" ? "They owe me" : "I owe";
}

function dueSoonCount(debts: Debt[]) {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return debts.filter((debt) => {
    if (debt.status !== "open" || !debt.dueAt) return false;
    const dueTime = new Date(debt.dueAt).getTime();
    return dueTime >= now && dueTime <= now + sevenDaysMs;
  }).length;
}

function DebtPreviewList({
  debts,
  preferences,
  emptyText,
  onOpen,
}: {
  debts: Debt[];
  preferences: Preferences;
  emptyText: string;
  onOpen: (debt: Debt) => void;
}) {
  if (!debts.length) {
    return <p className="text-sm muted">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {debts.map((debt) => (
        <button
          key={debt.id}
          type="button"
          className="w-full border border-(--border) px-3 py-3 text-left"
          onClick={() => onOpen(debt)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.12em]">
                {debt.title}
              </p>
              <p className="mt-1 text-xs matrix-label text-(--muted)">
                {kindLabel(debt.kind)}
                {debt.kind === "institutional"
                  ? ` • ${subtypeLabel(debt.institutionalSubtype)}`
                  : ` • ${directionLabel(debt.direction)}`}
                {debt.person ? ` • ${debt.person}` : ""}
              </p>
              <p className="mt-1 text-xs matrix-label muted-strong">
                Added {formatDate(debt.createdAt, preferences.locale)}
                {debt.dueAt ? ` • Due ${formatDate(debt.dueAt, preferences.locale)}` : ""}
              </p>
            </div>
            <p className="text-sm font-medium">
              {formatCurrency(
                debt.amount,
                preferences.locale,
                preferences.currency,
              )}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    id: "prefs",
    currency: "USD",
    locale: "en-US",
  });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DebtFormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [debtRows, prefs] = await Promise.all([getDebts(), getPreferences()]);
    setDebts(debtRows);
    setPreferences(prefs);
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  const lentDebts = useMemo(
    () => debts.filter((debt) => debt.kind === "lent" && debt.status === "open"),
    [debts],
  );
  const borrowedDebts = useMemo(
    () => debts.filter((debt) => debt.kind === "borrowed" && debt.status === "open"),
    [debts],
  );
  const institutionalDebts = useMemo(
    () => debts.filter((debt) => debt.kind === "institutional" && debt.status === "open"),
    [debts],
  );
  const peopleSummary = useMemo(
    () => summarizeDebts(debts.filter((debt) => debt.kind !== "institutional")),
    [debts],
  );
  const institutionalSummary = useMemo(
    () => summarizeDebts(institutionalDebts),
    [institutionalDebts],
  );
  const dueSoon = useMemo(() => dueSoonCount(institutionalDebts), [institutionalDebts]);

  function resetForm() {
    setForm({
      ...EMPTY_FORM,
      createdAt: dateTimeLocalValue(new Date().toISOString()),
    });
    setEditingId(null);
    setError(null);
  }

  function openCreateModal() {
    resetForm();
    setShowModal(true);
  }

  function openEditModal(debt: Debt) {
    setEditingId(debt.id);
    setError(null);
    setForm({
      title: debt.title,
      person: debt.person ?? "",
      amount: String(debt.amount),
      kind: debt.kind,
      institutionalSubtype: debt.institutionalSubtype ?? "loan",
      direction: debt.direction,
      status: debt.status,
      createdAt: dateTimeLocalValue(debt.createdAt),
      dueAt: debt.dueAt ? debt.dueAt.slice(0, 10) : "",
      note: debt.note ?? "",
    });
    setShowModal(true);
  }

  function updateForm<Key extends keyof DebtFormValues>(
    key: Key,
    value: DebtFormValues[Key],
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "kind") {
        if (value === "lent") next.direction = "owed_to_me";
        if (value === "borrowed" || value === "institutional") next.direction = "i_owe";
      }
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const amount = Number(form.amount);
    if (!form.title.trim()) {
      setError("Add a title for this record.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    if (!form.createdAt) {
      setError("Choose when this record was created.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title,
        person: form.person,
        amount,
        kind: form.kind,
        institutionalSubtype:
          form.kind === "institutional" ? form.institutionalSubtype : undefined,
        direction: form.direction,
        status: form.status,
        createdAt: new Date(form.createdAt).toISOString(),
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
        note: form.note,
      };

      if (editingId) {
        await updateDebt(editingId, payload);
      } else {
        await addDebt(payload);
      }

      await load();
      setShowModal(false);
      resetForm();
    } catch {
      setError("Could not save this debt record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <PageHeader
        title="Debts"
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 min-[420px]:justify-end">
            <Link href="/debts/history">
              <Button variant="secondary" className="text-xs">
                History
              </Button>
            </Link>
            <Button className="text-xs" onClick={openCreateModal}>
              Add Record
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        <Card className="space-y-3">
          <p className="text-xs uppercase tracking-[0.12em] text-(--muted)">
            Overview
          </p>
          <div className="grid grid-cols-2 gap-3 border-y border-(--border) py-2 text-xs matrix-label">
            <div>
              <p className="text-(--muted)">Lent Total</p>
              <p className="mt-1">
                {formatCurrency(
                  peopleSummary.receivable,
                  preferences.locale,
                  preferences.currency,
                )}
              </p>
            </div>
            <div>
              <p className="text-(--muted)">Borrowed Total</p>
              <p className="mt-1">
                {formatCurrency(
                  peopleSummary.payable,
                  preferences.locale,
                  preferences.currency,
                )}
              </p>
            </div>
            <div>
              <p className="text-(--muted)">Custom</p>
              <p className="mt-1">
                {formatCurrency(
                  institutionalSummary.payable,
                  preferences.locale,
                  preferences.currency,
                )}
              </p>
            </div>
            <div>
              <p className="text-(--muted)">Due Soon</p>
              <p className="mt-1">{dueSoon}</p>
            </div>
          </div>
          <p className="text-xs matrix-label muted-strong">
            Latest records only. Open History for the full ledger and filters.
          </p>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-(--muted)">
              Recent Lent
            </p>
            <span className="text-xs uppercase tracking-widest text-(--muted)">
              {lentDebts.length}
            </span>
          </div>
          {loading ? (
            <p className="text-sm muted">Loading records...</p>
          ) : (
            <DebtPreviewList
              debts={lentDebts.slice(0, RECENT_LIMIT)}
              preferences={preferences}
              emptyText="No open lent records."
              onOpen={openEditModal}
            />
          )}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-(--muted)">
              Recent Borrowed
            </p>
            <span className="text-xs uppercase tracking-widest text-(--muted)">
              {borrowedDebts.length}
            </span>
          </div>
          {loading ? (
            <p className="text-sm muted">Loading records...</p>
          ) : (
            <DebtPreviewList
              debts={borrowedDebts.slice(0, RECENT_LIMIT)}
              preferences={preferences}
              emptyText="No open borrowed records."
              onOpen={openEditModal}
            />
          )}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-(--muted)">
              Recent Custom
            </p>
            <span className="text-xs uppercase tracking-widest text-(--muted)">
              {institutionalDebts.length}
            </span>
          </div>
          {loading ? (
            <p className="text-sm muted">Loading records...</p>
          ) : (
            <DebtPreviewList
              debts={institutionalDebts.slice(0, RECENT_LIMIT)}
              preferences={preferences}
              emptyText="No open custom liabilities."
              onOpen={openEditModal}
            />
          )}
        </Card>
      </div>

      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          resetForm();
        }}
        title={editingId ? "Edit Record" : "New Debt Record"}
        subtitle="Track person-to-person and custom liabilities"
      >
        <Card>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <SegmentedControl
              label="Type"
              value={form.kind}
              options={[
                { label: "Lent", value: "lent" },
                { label: "Borrowed", value: "borrowed" },
                { label: "Custom", value: "institutional" },
              ]}
              onChange={(next) => updateForm("kind", next)}
            />

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Direction
              </p>
              <div className="border border-(--border) px-3 py-3 text-sm matrix-label">
                {form.kind === "lent" ? "They Owe Me" : "I Owe"}
              </div>
            </div>

            {form.kind === "institutional" ? (
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                  Custom Type
                </span>
                <Select
                  value={form.institutionalSubtype}
                  onChange={(next) =>
                    updateForm("institutionalSubtype", next as InstitutionalDebtSubtype)
                  }
                  options={[
                    { value: "loan", label: "Loan" },
                    { value: "credit_card", label: "Credit Card" },
                    { value: "other", label: "Other" },
                  ]}
                  ariaLabel="Select custom type"
                />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Title
              </span>
              <Input
                autoFocus
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder={
                  form.kind === "institutional" ? "Home loan outstanding" : "Lunch with Ravi"
                }
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                {form.kind === "institutional" ? "Institution / Source" : "Person"}
              </span>
              <Input
                value={form.person}
                onChange={(event) => updateForm("person", event.target.value)}
                placeholder={form.kind === "institutional" ? "HDFC Bank" : "Ravi"}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Amount
              </span>
              <Input
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Status
              </span>
              <Select
                value={form.status}
                onChange={(next) => updateForm("status", next as DebtStatus)}
                options={[
                  { value: "open", label: "Open" },
                  { value: "settled", label: "Settled" },
                ]}
                ariaLabel="Select status"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Created At
              </span>
              <Input
                type="datetime-local"
                value={form.createdAt}
                onChange={(event) => updateForm("createdAt", event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Due Date (Optional)
              </span>
              <Input
                type="date"
                value={form.dueAt}
                onChange={(event) => updateForm("dueAt", event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Note (Optional)
              </span>
              <Input
                value={form.note}
                onChange={(event) => updateForm("note", event.target.value)}
                placeholder="Track repayment note"
              />
            </label>

            {error ? <p className="text-sm text-(--danger)">{error}</p> : null}

            <div className="grid grid-cols-2 gap-2">
              {editingId ? (
                <Button
                  variant="danger"
                  className="w-full"
                  disabled={saving}
                  onClick={async () => {
                    if (!editingId) return;
                    setSaving(true);
                    try {
                      await deleteDebt(editingId);
                      await load();
                      setShowModal(false);
                      resetForm();
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Delete
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save Changes" : "Save Record"}
              </Button>
            </div>
          </form>
        </Card>
      </Modal>
    </main>
  );
}
