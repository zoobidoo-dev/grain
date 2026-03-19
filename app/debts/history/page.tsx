"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Input } from "@/app/components/ui/Input";
import { Select } from "@/app/components/ui/Select";
import { SegmentedControl } from "@/app/components/ui/SegmentedControl";
import { getDebts, getPreferences } from "@/lib/db";
import { formatCurrency, formatDate, searchableDateTerms } from "@/lib/format";
import type {
  Debt,
  DebtKind,
  DebtStatus,
  InstitutionalDebtSubtype,
  Preferences,
} from "@/lib/types";

type KindFilter = "all" | DebtKind;
type StatusFilter = "all" | DebtStatus;
type SubtypeFilter = "all" | InstitutionalDebtSubtype;

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

export default function DebtHistoryPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    id: "prefs",
    currency: "USD",
    locale: "en-US",
  });
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [subtypeFilter, setSubtypeFilter] = useState<SubtypeFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDebts(), getPreferences()])
      .then(([debtRows, prefs]) => {
        setDebts(debtRows);
        setPreferences(prefs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredDebts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return debts.filter((debt) => {
      if (kindFilter !== "all" && debt.kind !== kindFilter) return false;
      if (statusFilter !== "all" && debt.status !== statusFilter) return false;
      if (subtypeFilter !== "all") {
        if (debt.kind !== "institutional") return false;
        if ((debt.institutionalSubtype ?? "other") !== subtypeFilter) return false;
      }

      if (!query) return true;

      const fields = [
        debt.title.toLowerCase(),
        (debt.person ?? "").toLowerCase(),
        kindLabel(debt.kind).toLowerCase(),
        debt.kind === "institutional" ? subtypeLabel(debt.institutionalSubtype).toLowerCase() : "",
        debt.status.toLowerCase(),
        ...(debt.note ? [debt.note.toLowerCase()] : []),
        ...searchableDateTerms(debt.createdAt, preferences.locale),
      ];

      return fields.some((field) => field.includes(query));
    });
  }, [debts, kindFilter, preferences.locale, search, statusFilter, subtypeFilter]);

  return (
    <main>
      <PageHeader
        title="Debt History"
        actions={
          <Link href="/debts">
            <Button variant="secondary" className="text-xs">
              Overview
            </Button>
          </Link>
        }
      />

      <div className="space-y-4">
        <Card className="space-y-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, person, bank, card, date"
          />

          <SegmentedControl
            label="Status"
            value={statusFilter}
            options={[
              { label: "All", value: "all" },
              { label: "Open", value: "open" },
              { label: "Settled", value: "settled" },
            ]}
            onChange={setStatusFilter}
          />

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Type
            </span>
            <Select
              value={kindFilter}
              onChange={(next) => setKindFilter(next as KindFilter)}
              options={[
                { value: "all", label: "All Types" },
                { value: "lent", label: "Lent" },
                { value: "borrowed", label: "Borrowed" },
                { value: "institutional", label: "Custom" },
              ]}
              ariaLabel="Select debt type"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Custom Type
            </span>
            <Select
              value={subtypeFilter}
              onChange={(next) => setSubtypeFilter(next as SubtypeFilter)}
              options={[
                { value: "all", label: "All Subtypes" },
                { value: "loan", label: "Loan" },
                { value: "credit_card", label: "Credit Card" },
                { value: "other", label: "Other" },
              ]}
              ariaLabel="Select custom type"
            />
          </label>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-(--muted)">
              Records
            </p>
            <span className="text-xs uppercase tracking-widest text-(--muted)">
              {filteredDebts.length}
            </span>
          </div>

          {loading ? (
            <p className="text-sm muted">Loading history...</p>
          ) : filteredDebts.length === 0 ? (
            <p className="text-sm muted">No debt records match these filters.</p>
          ) : (
            <div className="space-y-2">
              {filteredDebts.map((debt) => (
                <div
                  key={debt.id}
                  className={`border border-(--border) px-3 py-3 ${debt.status === "settled" ? "opacity-70" : ""}`}
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
                          : ""}
                        {debt.person ? ` • ${debt.person}` : ""}
                        {` • ${debt.status}`}
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
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
