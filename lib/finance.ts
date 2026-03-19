import type {
  Budget,
  Category,
  Goal,
  Transaction,
  Transfer,
  Wallet,
} from "@/lib/types";

export function summarizeTransactions(transactions: Transaction[]) {
  let income = 0;
  let expenses = 0;
  for (const transaction of transactions) {
    if (transaction.type === "income") {
      income += transaction.amount;
    } else {
      expenses += transaction.amount;
    }
  }
  return {
    income,
    expenses,
    net: income - expenses,
  };
}

export function getMonthToDateDelta(transactions: Transaction[]) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return summarizeTransactions(
    transactions.filter((item) => new Date(item.createdAt) >= startOfMonth),
  ).net;
}

export function groupByDate(transactions: Transaction[]) {
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = tx.createdAt.slice(0, 10);
    const existing = groups.get(key) ?? [];
    existing.push(tx);
    groups.set(key, existing);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => (a > b ? -1 : 1));
}

export function categoryLabelMap(categories: Category[]) {
  return new Map(categories.map((category) => [category.id, category.name]));
}

export function monthKey(date = new Date()) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

export function getMonthlyCategorySpend(
  transactions: Transaction[],
  month: string,
  categoryId: string,
) {
  return transactions
    .filter(
      (tx) =>
        tx.type === "expense" &&
        tx.categoryId === categoryId &&
        tx.createdAt.slice(0, 7) === month,
    )
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function budgetProgress(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  month: string,
) {
  const categoryMap = categoryLabelMap(categories);
  return budgets
    .filter((budget) => budget.month === month)
    .map((budget) => {
      const spent = getMonthlyCategorySpend(
        transactions,
        month,
        budget.categoryId,
      );
      const progress = budget.limitAmount > 0 ? spent / budget.limitAmount : 0;
      return {
        ...budget,
        categoryName: categoryMap.get(budget.categoryId) ?? "Unknown",
        spent,
        progress,
        overLimit: spent > budget.limitAmount,
      };
    })
    .sort((a, b) => b.progress - a.progress);
}

export function weeklyTrend(transactions: Transaction[], weeks = 8) {
  const now = new Date();
  const items: { label: string; expenses: number; income: number }[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(now);
    start.setDate(now.getDate() - i * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    let expenses = 0;
    let income = 0;
    for (const tx of transactions) {
      const time = new Date(tx.createdAt);
      if (time >= start && time < end) {
        if (tx.type === "expense") expenses += tx.amount;
        else income += tx.amount;
      }
    }
    items.push({
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      expenses,
      income,
    });
  }
  return items;
}

export function monthlyTrend(transactions: Transaction[], months = 6) {
  const now = new Date();
  const items: { label: string; expenses: number; income: number }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const bucket = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = bucket.toISOString().slice(0, 7);
    const label = bucket.toLocaleDateString("en-US", { month: "short" });
    let expenses = 0;
    let income = 0;
    for (const tx of transactions) {
      if (tx.createdAt.slice(0, 7) !== key) continue;
      if (tx.type === "expense") expenses += tx.amount;
      else income += tx.amount;
    }
    items.push({ label, expenses, income });
  }
  return items;
}

export function categoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  month?: string,
) {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    if (month && tx.createdAt.slice(0, 7) !== month) continue;
    map.set(tx.categoryId, (map.get(tx.categoryId) ?? 0) + tx.amount);
  }
  const labels = categoryLabelMap(categories);
  return Array.from(map.entries())
    .map(([categoryId, total]) => ({
      categoryId,
      label: labels.get(categoryId) ?? "Unknown",
      total,
    }))
    .sort((a, b) => b.total - a.total);
}

export function largestTransaction(transactions: Transaction[]) {
  return transactions.reduce<Transaction | null>((largest, tx) => {
    if (!largest) return tx;
    return tx.amount > largest.amount ? tx : largest;
  }, null);
}

export function computeWalletBalances(
  wallets: Wallet[],
  transactions: Transaction[],
  transfers: Transfer[],
) {
  const balances = new Map<string, number>();
  for (const wallet of wallets) {
    balances.set(wallet.id, wallet.startingBalance);
  }
  for (const tx of transactions) {
    const current = balances.get(tx.walletId) ?? 0;
    const next = tx.type === "income" ? current + tx.amount : current - tx.amount;
    balances.set(tx.walletId, next);
  }
  for (const transfer of transfers) {
    balances.set(
      transfer.fromWalletId,
      (balances.get(transfer.fromWalletId) ?? 0) - transfer.amount,
    );
    balances.set(
      transfer.toWalletId,
      (balances.get(transfer.toWalletId) ?? 0) + transfer.amount,
    );
  }
  return balances;
}

type SmartQuery = {
  text: string[];
  category?: string;
  wallet?: string;
  type?: "income" | "expense";
  min?: number;
  max?: number;
  month?: number;
  year?: number;
};

const MONTH_ALIASES = new Map<string, number>(
  [
    ["jan", "january"],
    ["feb", "february"],
    ["mar", "march"],
    ["apr", "april"],
    ["may", "may"],
    ["jun", "june"],
    ["jul", "july"],
    ["aug", "august"],
    ["sep", "september"],
    ["oct", "october"],
    ["nov", "november"],
    ["dec", "december"],
  ]
    .flatMap((names, index) => names.map((name) => [name, index]))
    .map(([name, index]) => [name, index] as [string, number]),
);

function parseMonthToken(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized) return undefined;
  return MONTH_ALIASES.get(normalized);
}

function sanitizeToken(value: string) {
  return value.toLowerCase().replace(/[.,]/g, "");
}

export function parseSmartQuery(input: string): SmartQuery {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const parsed: SmartQuery = { text: [] };
  for (const rawToken of tokens) {
    const token = rawToken.toLowerCase();
    if (token.startsWith("cat:")) {
      parsed.category = sanitizeToken(token.slice(4));
      continue;
    }
    if (token.startsWith("wallet:")) {
      parsed.wallet = sanitizeToken(token.slice(7));
      continue;
    }
    if (token.startsWith("type:")) {
      const value = sanitizeToken(token.slice(5));
      if (value === "income" || value === "expense") parsed.type = value;
      continue;
    }
    if (token.startsWith("min:")) {
      const value = Number(token.slice(4));
      if (Number.isFinite(value)) parsed.min = value;
      continue;
    }
    if (token.startsWith("max:")) {
      const value = Number(token.slice(4));
      if (Number.isFinite(value)) parsed.max = value;
      continue;
    }
    if (token.startsWith("month:")) {
      const month = parseMonthToken(token.slice(6));
      if (month !== undefined) {
        parsed.month = month;
        continue;
      }
    }
    if (token.startsWith("year:")) {
      const value = Number(token.slice(5));
      if (Number.isFinite(value)) {
        parsed.year = value;
        continue;
      }
    }
    const month = parseMonthToken(token);
    if (month !== undefined) {
      parsed.month = month;
      continue;
    }
    parsed.text.push(token);
  }
  return parsed;
}

export function goalProgress(goal: Goal) {
  if (!goal.targetAmount) return 0;
  return Math.min(1, goal.currentAmount / goal.targetAmount);
}
