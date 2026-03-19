"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/app/components/PageHeader";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Input } from "@/app/components/ui/Input";
import { Modal } from "@/app/components/ui/Modal";
import { Select } from "@/app/components/ui/Select";
import { SegmentedControl } from "@/app/components/ui/SegmentedControl";
import {
  deleteTransaction,
  getCategories,
  getPreferences,
  getTransactions,
  getWallets,
} from "@/lib/db";
import { categoryLabelMap, groupByDate, parseSmartQuery } from "@/lib/finance";
import { formatCurrency, formatDate, searchableDateTerms } from "@/lib/format";
import type {
  Category,
  Preferences,
  Transaction,
  TransactionType,
  Wallet,
} from "@/lib/types";

type TypeFilter = "all" | TransactionType;
type DateFilter = "all" | "7d" | "30d";

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    id: "prefs",
    currency: "USD",
    locale: "en-US",
  });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [dateCutoffMs, setDateCutoffMs] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [walletFilter, setWalletFilter] = useState<string>("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  async function load() {
    const [txRows, categoryRows, prefs, walletRows] = await Promise.all([
      getTransactions(),
      getCategories(),
      getPreferences(),
      getWallets(),
    ]);
    setTransactions(txRows);
    setCategories(categoryRows);
    setPreferences(prefs);
    setWallets(walletRows);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTransactions(), getCategories(), getPreferences(), getWallets()])
      .then(([txRows, categoryRows, prefs, walletRows]) => {
        if (cancelled) return;
        setTransactions(txRows);
        setCategories(categoryRows);
        setPreferences(prefs);
        setWallets(walletRows);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryMap = useMemo(() => categoryLabelMap(categories), [categories]);
  const walletMap = useMemo(
    () => new Map(wallets.map((wallet) => [wallet.id, wallet.name])),
    [wallets],
  );

  const filteredTransactions = useMemo(() => {
    const smartQuery = parseSmartQuery(search);
    const min = Number(minAmount);
    const max = Number(maxAmount);
    return transactions.filter((tx) => {
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;
      if (categoryFilter !== "all" && tx.categoryId !== categoryFilter) return false;
      if (walletFilter !== "all" && tx.walletId !== walletFilter) return false;
      if (dateCutoffMs !== null) {
        const txTime = new Date(tx.createdAt).getTime();
        if (txTime < dateCutoffMs) return false;
      }
      if (Number.isFinite(min) && minAmount && tx.amount < min) return false;
      if (Number.isFinite(max) && maxAmount && tx.amount > max) return false;

      const txDate = new Date(tx.createdAt);
      if (
        smartQuery.month !== undefined &&
        txDate.getMonth() !== smartQuery.month
      )
        return false;
      if (
        smartQuery.year !== undefined &&
        txDate.getFullYear() !== smartQuery.year
      )
        return false;

      if (smartQuery.type && tx.type !== smartQuery.type) return false;
      const categoryLabel = (categoryMap.get(tx.categoryId) ?? "").toLowerCase();
      const walletLabel = (walletMap.get(tx.walletId) ?? "").toLowerCase();
      if (smartQuery.category && !categoryLabel.includes(smartQuery.category))
        return false;
      if (smartQuery.wallet && !walletLabel.includes(smartQuery.wallet))
        return false;
      if (smartQuery.min !== undefined && tx.amount < smartQuery.min) return false;
      if (smartQuery.max !== undefined && tx.amount > smartQuery.max) return false;

      if (!search.trim()) return true;
      const amount = String(tx.amount);
      const note = (tx.note ?? "").toLowerCase();
      const dateTerms = searchableDateTerms(tx.createdAt, preferences.locale);
      return smartQuery.text.every((query) =>
        [categoryLabel, walletLabel, amount, note, ...dateTerms].some((field) =>
          field.includes(query),
        ),
      );
    });
  }, [
    transactions,
    typeFilter,
    categoryFilter,
    walletFilter,
    dateCutoffMs,
    search,
    categoryMap,
    walletMap,
    preferences.locale,
    minAmount,
    maxAmount,
  ]);

  const grouped = useMemo(
    () => groupByDate(filteredTransactions),
    [filteredTransactions],
  );
  const activeFilterCount =
    Number(Boolean(typeFilter !== "all")) +
    Number(Boolean(dateFilter !== "all")) +
    Number(Boolean(categoryFilter !== "all")) +
    Number(Boolean(walletFilter !== "all")) +
    Number(Boolean(minAmount.trim())) +
    Number(Boolean(maxAmount.trim())) +
    Number(Boolean(search.trim()));

  return (
    <main>
      <PageHeader
        title="Transactions"
        subtitle="History"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" className="text-xs" onClick={() => setShowFilters(true)}>
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </Button>
            <Link href="/transactions/new">
              <Button className="text-xs">Add</Button>
            </Link>
          </div>
        }
      />

      <Card className="space-y-2">
        <p className="text-xs matrix-label text-[var(--muted)]">Active Filters</p>
        <p className="text-sm matrix-label">
          {activeFilterCount === 0
            ? "None"
            : `${activeFilterCount} enabled • ${filteredTransactions.length} results`}
        </p>
      </Card>

      <Modal
        open={showFilters}
        onClose={() => setShowFilters(false)}
        title="Transaction Filters"
        subtitle="Search + drill down"
      >
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Smart search: cat:food wallet:main min:5"
          />

          <SegmentedControl
            label="Type"
            value={typeFilter}
            options={[
              { label: "All", value: "all" },
              { label: "Expense", value: "expense" },
              { label: "Income", value: "income" },
            ]}
            onChange={setTypeFilter}
          />

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Date Range
            </p>
            <div className="flex gap-2">
              {[
                { value: "all", label: "All" },
                { value: "7d", label: "7D" },
                { value: "30d", label: "30D" },
              ].map((option) => (
                <Button
                  key={option.value}
                  variant={dateFilter === option.value ? "primary" : "secondary"}
                  className="flex-1 text-xs"
                  onClick={() => {
                    const next = option.value as DateFilter;
                    setDateFilter(next);
                    if (next === "all") {
                      setDateCutoffMs(null);
                      return;
                    }
                    const days = next === "7d" ? 7 : 30;
                    setDateCutoffMs(Date.now() - days * 86400000);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Category
            </span>
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "All Categories" },
                ...categories
                  .filter((item) => !item.archived)
                  .map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
              ]}
              className="text-sm"
              ariaLabel="Filter by category"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Wallet
            </span>
            <Select
              value={walletFilter}
              onChange={setWalletFilter}
              options={[
                { value: "all", label: "All Wallets" },
                ...wallets.map((wallet) => ({
                  value: wallet.id,
                  label: wallet.name,
                })),
              ]}
              className="text-sm"
              ariaLabel="Filter by wallet"
            />
          </label>

          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Min Amount
              </span>
              <Input
                inputMode="decimal"
                value={minAmount}
                onChange={(event) => setMinAmount(event.target.value)}
                placeholder="0"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Max Amount
              </span>
              <Input
                inputMode="decimal"
                value={maxAmount}
                onChange={(event) => setMaxAmount(event.target.value)}
                placeholder="1000"
              />
            </label>
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setSearch("");
              setTypeFilter("all");
              setDateFilter("all");
              setDateCutoffMs(null);
              setCategoryFilter("all");
              setWalletFilter("all");
              setMinAmount("");
              setMaxAmount("");
            }}
          >
            Reset Filters
          </Button>
        </div>
      </Modal>

      <section className="mt-4 space-y-4">
        {loading ? <p className="muted text-sm">Loading transactions...</p> : null}
        {!loading && grouped.length === 0 ? (
          <Card>
            <p className="text-sm muted">No transactions match these filters.</p>
          </Card>
        ) : null}

        {grouped.map(([date, rows]) => (
          <Card key={date}>
            <p className="mb-3 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              {formatDate(date, preferences.locale)}
            </p>
            <div className="space-y-2">
              {rows.map((tx) => (
                <div
                  key={tx.id}
                  className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm matrix-label">
                      {categoryMap.get(tx.categoryId) ?? "Unknown"}
                    </p>
                    <span className="text-xs matrix-label">
                      {tx.type === "expense" ? "-" : "+"}
                      {formatCurrency(
                        tx.amount,
                        preferences.locale,
                        preferences.currency,
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs matrix-label text-[var(--muted)] break-words">
                    {tx.splits?.length
                      ? `${walletMap.get(tx.walletId) ?? "Wallet"} • split:${tx.splits.length}`
                      : `${walletMap.get(tx.walletId) ?? "Wallet"} • ${tx.note ?? tx.type}`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-[0.65rem]"
                      onClick={() => router.push(`/transactions/${tx.id}`)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      className="px-2 py-1 text-[0.65rem]"
                      onClick={async () => {
                        const ok = window.confirm("Delete this transaction permanently?");
                        if (!ok) return;
                        await deleteTransaction(tx.id);
                        await load();
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}
