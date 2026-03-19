"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { ListRow } from "@/app/components/ui/ListRow";
import {
  getDebts,
  getBudgets,
  getCategories,
  getPreferences,
  getTransactions,
} from "@/lib/db";
import {
  budgetProgress,
  categoryLabelMap,
  monthKey,
  summarizeDebts,
  summarizeTransactions,
} from "@/lib/finance";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Budget, Category, Debt, Preferences, Transaction } from "@/lib/types";

function MatrixMeter({
  value,
  danger = false,
  cells = 18,
}: {
  value: number;
  danger?: boolean;
  cells?: number;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const active = Math.round(clamped * cells);

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cells }).map((_, index) => (
        <span
          key={index}
          className={`h-2 border border-(--border) ${
            index < active
              ? danger
                ? "bg-(--danger)"
                : "bg-white"
              : "bg-transparent"
          }`}
        />
      ))}
    </div>
  );
}

function EmptyLedgerState() {
  return (
    <div className="space-y-3">
      <div className="rounded-none border border-(--border) p-3">
        <div className="mb-2 flex items-center justify-between text-[0.62rem] uppercase tracking-[0.16em] text-foreground matrix-label">
          <span>Matrix Seed</span>
          <span>0 TX</span>
        </div>
        <div className="grid grid-cols-12 gap-1">
          {Array.from({ length: 24 }).map((_, index) => {
            const active = index % 5 === 0 || index % 7 === 0;
            return (
              <span
                key={index}
                className={`h-2 border border-(--border) ${
                  active ? "animate-pulse bg-white/80" : "bg-transparent"
                }`}
                style={active ? { animationDelay: `${(index % 6) * 180}ms` } : undefined}
              />
            );
          })}
        </div>
      </div>

      <p className="text-xs matrix-label muted-strong">
        No entries yet. Seed the grid with your first transaction.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/transactions/new">
          <Button className="w-full">Add First</Button>
        </Link>
        <Link href="/templates">
          <Button variant="secondary" className="w-full">
            Add Recurring
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    id: "prefs",
    currency: "USD",
    locale: "en-US",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const month = monthKey();
      const [txRows, categoryRows, prefs, budgetRows, debtRows] = await Promise.all([
        getTransactions(),
        getCategories(),
        getPreferences(),
        getBudgets(month),
        getDebts(),
      ]);
      setTransactions(txRows);
      setCategories(categoryRows);
      setPreferences(prefs);
      setBudgets(budgetRows);
      setDebts(debtRows);
      setLoading(false);
    }

    load().catch(() => setLoading(false));
  }, []);

  const currentMonth = monthKey();
  const monthlySummary = useMemo(
    () =>
      summarizeTransactions(
        transactions.filter((item) => item.createdAt.slice(0, 7) === currentMonth),
      ),
    [transactions, currentMonth],
  );
  const labels = useMemo(() => categoryLabelMap(categories), [categories]);
  const budgetItems = useMemo(
    () => budgetProgress(budgets, transactions, categories, currentMonth),
    [budgets, transactions, categories, currentMonth],
  );
  const focusedBudgets = useMemo(
    () => budgetItems.filter((item) => item.progress >= 0.6).slice(0, 3),
    [budgetItems],
  );
  const personalDebtSummary = useMemo(
    () => summarizeDebts(debts.filter((debt) => debt.kind !== "institutional")),
    [debts],
  );
  const institutionalDebtSummary = useMemo(
    () => summarizeDebts(debts.filter((debt) => debt.kind === "institutional")),
    [debts],
  );
  const isEmptyState = !loading && transactions.length === 0;

  return (
    <main>
      <PageHeader
        title="Dashboard"
        subtitle="Grain Finance"
        showDivider={false}
      />

      <section className={isEmptyState ? "space-y-4" : "space-y-4"}>
        <Card className="space-y-3 transition-colors duration-200 hover:border-white/15">
          <p className="text-xs uppercase tracking-[0.12em] text-(--muted)">
            This Month
          </p>
          <p className="text-4xl font-semibold tracking-[0.05em]">
            {formatCurrency(
              monthlySummary.net,
              preferences.locale,
              preferences.currency,
            )}
          </p>
          <p className="text-xs uppercase tracking-[0.12em] text-(--muted)">
            Net this month
          </p>
          <div className="grid grid-cols-2 gap-3 border-y border-(--border) py-2 text-xs matrix-label">
            <div>
              <p className="text-(--muted)">Income</p>
              <p className="mt-1">
                +
                {formatCurrency(
                  monthlySummary.income,
                  preferences.locale,
                  preferences.currency,
                )}
              </p>
            </div>
            <div>
              <p className="text-(--muted)">Expenses</p>
              <p className="mt-1">
                -
                {formatCurrency(
                  monthlySummary.expenses,
                  preferences.locale,
                  preferences.currency,
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end text-xs matrix-label">
            <Link href="/transactions/new">
              <Button className="px-3">Add Transaction</Button>
            </Link>
          </div>
        </Card>

        <Card
          className={`transition-colors duration-200 hover:border-white/15 ${
            isEmptyState ? "space-y-3 p-4" : "space-y-3"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs matrix-label text-(--muted)">Budget Focus</p>
            <Link href="/budgets" className="text-xs matrix-label text-foreground">
              {isEmptyState ? "Setup" : "Manage"}
            </Link>
          </div>
          {isEmptyState ? (
            <p className="text-xs matrix-label muted-strong">
              Set a monthly budget to activate tracking.
            </p>
          ) : budgetItems.length === 0 ? (
            <p className="text-sm muted">No budgets set for this month.</p>
          ) : focusedBudgets.length === 0 ? (
            <p className="text-sm muted">
              Budgets look healthy. No category is near the limit.
            </p>
          ) : (
            focusedBudgets.map((item) => (
              <div key={item.id}>
                <div className="mb-1 flex justify-between text-xs matrix-label">
                  <span>{item.categoryName}</span>
                  <span>
                    {formatCurrency(
                      item.spent,
                      preferences.locale,
                      preferences.currency,
                    )}{" "}
                    /{" "}
                    {formatCurrency(
                      item.limitAmount,
                      preferences.locale,
                      preferences.currency,
                    )}
                  </span>
                </div>
                <MatrixMeter value={item.progress} danger={item.overLimit} />
              </div>
            ))
          )}
        </Card>

        <Card
          className={`transition-colors duration-200 hover:border-white/15 ${
            isEmptyState ? "p-4" : ""
          }`}
        >
          <div className={`${isEmptyState ? "mb-3" : "mb-3"} flex items-center justify-between`}>
            <p className="text-xs uppercase tracking-[0.12em] text-(--muted)">
              Recent Transactions
            </p>
            <Link href="/transactions" className="text-xs uppercase tracking-widest">
              View all
            </Link>
          </div>

          {loading ? <p className="muted text-sm">Loading...</p> : null}

          {!loading && transactions.length === 0 ? (
            <EmptyLedgerState />
          ) : (
            <div className="space-y-2">
              {transactions.slice(0, 4).map((transaction) => (
                <ListRow
                  key={transaction.id}
                  title={labels.get(transaction.categoryId) ?? "Unknown"}
                  subtitle={formatDate(transaction.createdAt, preferences.locale)}
                  trailing={
                    <span className="text-xs uppercase tracking-widest">
                      {transaction.type === "expense" ? "-" : "+"}
                      {formatCurrency(
                        transaction.amount,
                        preferences.locale,
                        preferences.currency,
                      )}
                    </span>
                  }
                />
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3 transition-colors duration-200 hover:border-white/15">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-(--muted)">
              Debts
            </p>
            <Link href="/debts" className="text-xs uppercase tracking-widest">
              Open
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 border-y border-(--border) py-2 text-xs matrix-label">
            <div>
              <p className="text-(--muted)">Lent</p>
              <p className="mt-1">
                {formatCurrency(
                  personalDebtSummary.receivable,
                  preferences.locale,
                  preferences.currency,
                )}
              </p>
            </div>
            <div>
              <p className="text-(--muted)">Borrowed</p>
              <p className="mt-1">
                {formatCurrency(
                  personalDebtSummary.payable,
                  preferences.locale,
                  preferences.currency,
                )}
              </p>
            </div>
            <div className="col-span-2 border-t border-(--border) pt-2">
              <p className="text-(--muted)">Custom</p>
              <p className="mt-1">
                {formatCurrency(
                  institutionalDebtSummary.payable,
                  preferences.locale,
                  preferences.currency,
                )}
              </p>
            </div>
          </div>
          <p className="text-xs matrix-label muted-strong">
            {personalDebtSummary.openCount || institutionalDebtSummary.openCount
              ? `${personalDebtSummary.openCount} personal and ${institutionalDebtSummary.openCount} custom open records.`
              : "Track lent money, borrowed money, and custom liabilities."}
          </p>
        </Card>

      </section>
    </main>
  );
}
