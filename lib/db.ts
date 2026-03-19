import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_PREFERENCES,
  DEFAULT_WALLETS,
} from "@/lib/constants";
import type {
  Budget,
  Category,
  Debt,
  DebtDirection,
  DebtKind,
  DebtStatus,
  ExportPayload,
  Goal,
  InstitutionalDebtSubtype,
  Preferences,
  RecurringFrequency,
  RecurringTemplate,
  SplitItem,
  Transaction,
  TransactionType,
  Transfer,
  Wallet,
  WalletType,
} from "@/lib/types";

type NewTransaction = {
  amount: number;
  type: TransactionType;
  categoryId: string;
  walletId?: string;
  splits?: SplitItem[];
  templateId?: string;
  transferId?: string;
  note?: string;
  createdAt?: string;
};

type NewCategory = {
  name: string;
};

type UpdateCategory = {
  id: string;
  name?: string;
  archived?: boolean;
};

type RemoveCategoryInput = {
  id: string;
  replacementCategoryId: string;
};

type BudgetInput = {
  month: string;
  categoryId: string;
  limitAmount: number;
};

type NewRecurringTemplate = {
  name: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  walletId: string;
  note?: string;
  frequency: RecurringFrequency;
  nextRunAt: string;
};

type NewWallet = {
  name: string;
  type: WalletType;
  startingBalance?: number;
};

type NewTransfer = {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  note?: string;
  createdAt?: string;
};

type NewGoal = {
  name: string;
  targetAmount: number;
  currentAmount?: number;
  walletId?: string;
  deadline?: string;
};

type NewDebt = {
  title: string;
  amount: number;
  kind: DebtKind;
  institutionalSubtype?: InstitutionalDebtSubtype;
  direction: DebtDirection;
  status?: DebtStatus;
  person?: string;
  dueAt?: string;
  note?: string;
  createdAt?: string;
};

interface GrainDb extends DBSchema {
  transactions: {
    key: string;
    value: Transaction;
    indexes: { "by-createdAt": string; "by-type": TransactionType };
  };
  categories: {
    key: string;
    value: Category;
    indexes: { "by-archived": number };
  };
  preferences: {
    key: string;
    value: Preferences;
  };
  budgets: {
    key: string;
    value: Budget;
    indexes: { "by-month": string; "by-category": string };
  };
  recurringTemplates: {
    key: string;
    value: RecurringTemplate;
    indexes: { "by-nextRunAt": string; "by-active": number };
  };
  wallets: {
    key: string;
    value: Wallet;
  };
  transfers: {
    key: string;
    value: Transfer;
    indexes: { "by-createdAt": string };
  };
  goals: {
    key: string;
    value: Goal;
  };
  debts: {
    key: string;
    value: Debt;
    indexes: { "by-createdAt": string; "by-status": DebtStatus };
  };
}

const DB_NAME = "grain-db";
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<GrainDb>> | null = null;

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addInterval(isoDate: string, frequency: RecurringFrequency) {
  const date = new Date(isoDate);
  if (frequency === "weekly") {
    date.setDate(date.getDate() + 7);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString();
}

function normalizeDebt(row: Debt | (Omit<Debt, "kind"> & { kind: DebtKind | "custom" })) {
  const kind = row.kind === "custom" ? "institutional" : row.kind;
  return {
    ...row,
    kind,
    institutionalSubtype:
      kind === "institutional" ? row.institutionalSubtype ?? "other" : undefined,
    direction:
      kind === "institutional"
        ? "i_owe"
        : row.direction,
  } as Debt;
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<GrainDb>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const transactions = db.createObjectStore("transactions", {
            keyPath: "id",
          });
          transactions.createIndex("by-createdAt", "createdAt");
          transactions.createIndex("by-type", "type");

          const categories = db.createObjectStore("categories", {
            keyPath: "id",
          });
          categories.createIndex("by-archived", "archived");

          db.createObjectStore("preferences", { keyPath: "id" });
        }

        if (oldVersion < 2) {
          const budgets = db.createObjectStore("budgets", {
            keyPath: "id",
          });
          budgets.createIndex("by-month", "month");
          budgets.createIndex("by-category", "categoryId");

          const recurringTemplates = db.createObjectStore("recurringTemplates", {
            keyPath: "id",
          });
          recurringTemplates.createIndex("by-nextRunAt", "nextRunAt");
          recurringTemplates.createIndex("by-active", "active");

          db.createObjectStore("wallets", { keyPath: "id" });

          const transfers = db.createObjectStore("transfers", {
            keyPath: "id",
          });
          transfers.createIndex("by-createdAt", "createdAt");

          db.createObjectStore("goals", { keyPath: "id" });
        }

        if (oldVersion < 3) {
          const debts = db.createObjectStore("debts", {
            keyPath: "id",
          });
          debts.createIndex("by-createdAt", "createdAt");
          debts.createIndex("by-status", "status");
        }
      },
    });
  }

  const db = await dbPromise;
  await ensureSeedData(db);
  return db;
}

async function ensureSeedData(db: IDBPDatabase<GrainDb>) {
  const categoryCount = await db.count("categories");
  if (!categoryCount) {
    const tx = db.transaction(["categories", "preferences", "wallets"], "readwrite");
    for (const category of DEFAULT_CATEGORIES) {
      await tx.objectStore("categories").put(category);
    }
    await tx.objectStore("preferences").put(DEFAULT_PREFERENCES);
    for (const wallet of DEFAULT_WALLETS) {
      await tx.objectStore("wallets").put(wallet);
    }
    await tx.done;
  } else {
    const prefs = await db.get("preferences", "prefs");
    if (!prefs) {
      await db.put("preferences", DEFAULT_PREFERENCES);
    }
  }

  const walletCount = await db.count("wallets");
  if (!walletCount) {
    const tx = db.transaction(["wallets", "preferences"], "readwrite");
    for (const wallet of DEFAULT_WALLETS) {
      await tx.objectStore("wallets").put(wallet);
    }
    const currentPrefs =
      (await tx.objectStore("preferences").get("prefs")) ?? DEFAULT_PREFERENCES;
    await tx
      .objectStore("preferences")
      .put({ ...currentPrefs, defaultWalletId: DEFAULT_WALLETS[0].id });
    await tx.done;
  }
}

export async function getTransactions() {
  const db = await getDb();
  const rows = await db.getAll("transactions");
  return rows.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function getTransactionById(id: string) {
  const db = await getDb();
  return db.get("transactions", id);
}

export async function addTransaction(input: NewTransaction) {
  const db = await getDb();
  const isoDate = input.createdAt ?? new Date().toISOString();
  const prefs = await getPreferences();
  const walletId = input.walletId ?? prefs.defaultWalletId ?? DEFAULT_WALLETS[0].id;
  const row: Transaction = {
    id: generateId(),
    amount: input.amount,
    type: input.type,
    categoryId: input.categoryId,
    walletId,
    templateId: input.templateId,
    transferId: input.transferId,
    splits: input.splits,
    note: input.note?.trim(),
    createdAt: isoDate,
    updatedAt: isoDate,
  };
  await db.put("transactions", row);
  return row;
}

export async function addTransactions(
  inputs: Array<
    Pick<
      NewTransaction,
      "amount" | "type" | "categoryId" | "walletId" | "createdAt" | "note"
    >
  >,
) {
  if (!inputs.length) return [];

  const db = await getDb();
  const prefs = await getPreferences();
  const fallbackWalletId =
    prefs.defaultWalletId ?? DEFAULT_WALLETS[0].id;
  const tx = db.transaction("transactions", "readwrite");
  const store = tx.objectStore("transactions");
  const rows: Transaction[] = [];

  for (const input of inputs) {
    const isoDate = input.createdAt ?? new Date().toISOString();
    const row: Transaction = {
      id: generateId(),
      amount: input.amount,
      type: input.type,
      categoryId: input.categoryId,
      walletId: input.walletId ?? fallbackWalletId,
      note: input.note?.trim(),
      createdAt: isoDate,
      updatedAt: isoDate,
    };
    await store.put(row);
    rows.push(row);
  }

  await tx.done;
  return rows;
}

export async function updateTransaction(
  id: string,
  input: Partial<Omit<Transaction, "id" | "updatedAt">>,
) {
  const db = await getDb();
  const existing = await db.get("transactions", id);
  if (!existing) return null;
  const updated: Transaction = {
    ...existing,
    ...input,
    note: input.note?.trim(),
    updatedAt: new Date().toISOString(),
  };
  await db.put("transactions", updated);
  return updated;
}

export async function deleteTransaction(id: string) {
  const db = await getDb();
  await db.delete("transactions", id);
}

export async function getCategories() {
  const db = await getDb();
  const rows = await db.getAll("categories");
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addCategory(input: NewCategory) {
  const db = await getDb();
  const timestamp = new Date().toISOString();
  const row: Category = {
    id: generateId(),
    name: input.name.trim(),
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.put("categories", row);
  return row;
}

export async function updateCategory(input: UpdateCategory) {
  const db = await getDb();
  const existing = await db.get("categories", input.id);
  if (!existing) return null;
  const row: Category = {
    ...existing,
    ...("name" in input ? { name: input.name?.trim() ?? existing.name } : {}),
    ...("archived" in input ? { archived: input.archived ?? false } : {}),
    updatedAt: new Date().toISOString(),
  };
  await db.put("categories", row);
  return row;
}

export async function removeCategory(input: RemoveCategoryInput) {
  if (input.id === input.replacementCategoryId) {
    throw new Error("Replacement category must be different.");
  }

  const db = await getDb();
  const [existing, replacement, categoryCount] = await Promise.all([
    db.get("categories", input.id),
    db.get("categories", input.replacementCategoryId),
    db.count("categories"),
  ]);
  if (!existing) return null;
  if (!replacement) {
    throw new Error("Replacement category not found.");
  }
  if (categoryCount <= 1) {
    throw new Error("At least one category must remain.");
  }

  const now = new Date().toISOString();
  const tx = db.transaction(
    ["categories", "transactions", "budgets", "recurringTemplates"],
    "readwrite",
  );

  const transactionStore = tx.objectStore("transactions");
  const transactionRows = await transactionStore.getAll();
  let updatedTransactions = 0;
  for (const row of transactionRows) {
    const splitChanged =
      row.splits?.some((split) => split.categoryId === input.id) ?? false;
    const topLevelChanged = row.categoryId === input.id;
    if (!splitChanged && !topLevelChanged) continue;

    await transactionStore.put({
      ...row,
      categoryId: topLevelChanged ? input.replacementCategoryId : row.categoryId,
      splits: row.splits?.map((split) =>
        split.categoryId === input.id
          ? { ...split, categoryId: input.replacementCategoryId }
          : split,
      ),
      updatedAt: now,
    });
    updatedTransactions += 1;
  }

  const recurringStore = tx.objectStore("recurringTemplates");
  const recurringRows = await recurringStore.getAll();
  let updatedRecurringTemplates = 0;
  for (const row of recurringRows) {
    if (row.categoryId !== input.id) continue;
    await recurringStore.put({
      ...row,
      categoryId: input.replacementCategoryId,
      updatedAt: now,
    });
    updatedRecurringTemplates += 1;
  }

  const budgetStore = tx.objectStore("budgets");
  const budgetRows = await budgetStore.getAll();
  let movedBudgets = 0;
  const mergedBudgets = new Map<string, Budget>();
  for (const row of budgetRows) {
    const nextCategoryId =
      row.categoryId === input.id ? input.replacementCategoryId : row.categoryId;
    if (row.categoryId === input.id) movedBudgets += 1;
    const mergeKey = `${row.month}::${nextCategoryId}`;
    const existingBudget = mergedBudgets.get(mergeKey);
    if (!existingBudget) {
      mergedBudgets.set(mergeKey, {
        ...row,
        categoryId: nextCategoryId,
        updatedAt: row.categoryId === input.id ? now : row.updatedAt,
      });
      continue;
    }

    mergedBudgets.set(mergeKey, {
      ...existingBudget,
      limitAmount: existingBudget.limitAmount + row.limitAmount,
      updatedAt: now,
    });
  }
  await budgetStore.clear();
  for (const row of mergedBudgets.values()) {
    await budgetStore.put(row);
  }

  await tx.objectStore("categories").delete(input.id);
  await tx.done;

  return {
    removedCategoryId: input.id,
    replacementCategoryId: input.replacementCategoryId,
    updatedTransactions,
    updatedRecurringTemplates,
    movedBudgets,
  };
}

export async function getPreferences() {
  const db = await getDb();
  const prefs = await db.get("preferences", "prefs");
  return prefs ?? { ...DEFAULT_PREFERENCES, defaultWalletId: DEFAULT_WALLETS[0].id };
}

export async function updatePreferences(input: Partial<Preferences>) {
  const db = await getDb();
  const existing = (await db.get("preferences", "prefs")) ?? DEFAULT_PREFERENCES;
  const next: Preferences = {
    ...existing,
    ...input,
    id: "prefs",
  };
  await db.put("preferences", next);
  return next;
}

export async function getBudgets(month?: string) {
  const db = await getDb();
  const rows = month
    ? await db.getAllFromIndex("budgets", "by-month", month)
    : await db.getAll("budgets");
  return rows.sort((a, b) => a.categoryId.localeCompare(b.categoryId));
}

export async function upsertBudget(input: BudgetInput) {
  const db = await getDb();
  const existing = await db.getAllFromIndex("budgets", "by-month", input.month);
  const match = existing.find((row) => row.categoryId === input.categoryId);
  const now = new Date().toISOString();
  const next: Budget = match
    ? {
        ...match,
        limitAmount: input.limitAmount,
        updatedAt: now,
      }
    : {
        id: generateId(),
        month: input.month,
        categoryId: input.categoryId,
        limitAmount: input.limitAmount,
        createdAt: now,
        updatedAt: now,
      };
  await db.put("budgets", next);
  return next;
}

export async function deleteBudget(id: string) {
  const db = await getDb();
  await db.delete("budgets", id);
}

export async function getRecurringTemplates() {
  const db = await getDb();
  const rows = await db.getAll("recurringTemplates");
  return rows.sort((a, b) => (a.nextRunAt > b.nextRunAt ? 1 : -1));
}

export async function addRecurringTemplate(input: NewRecurringTemplate) {
  const db = await getDb();
  const now = new Date().toISOString();
  const row: RecurringTemplate = {
    id: generateId(),
    name: input.name.trim(),
    amount: input.amount,
    type: input.type,
    categoryId: input.categoryId,
    walletId: input.walletId,
    note: input.note?.trim(),
    frequency: input.frequency,
    nextRunAt: input.nextRunAt,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.put("recurringTemplates", row);
  return row;
}

export async function updateRecurringTemplate(
  id: string,
  input: Partial<Omit<RecurringTemplate, "id" | "createdAt" | "updatedAt">>,
) {
  const db = await getDb();
  const existing = await db.get("recurringTemplates", id);
  if (!existing) return null;
  const row: RecurringTemplate = {
    ...existing,
    ...input,
    name: input.name?.trim() ?? existing.name,
    note: "note" in input ? input.note?.trim() : existing.note,
    updatedAt: new Date().toISOString(),
  };
  await db.put("recurringTemplates", row);
  return row;
}

export async function deleteRecurringTemplate(id: string) {
  const db = await getDb();
  await db.delete("recurringTemplates", id);
}

export async function applyDueTemplates(runAtIso = new Date().toISOString()) {
  const db = await getDb();
  const templates = await db.getAll("recurringTemplates");
  const dueTemplates = templates.filter(
    (template) => template.active && template.nextRunAt <= runAtIso,
  );
  if (!dueTemplates.length) return 0;

  const tx = db.transaction(["transactions", "recurringTemplates"], "readwrite");
  let createdCount = 0;
  for (const template of dueTemplates) {
    const transaction: Transaction = {
      id: generateId(),
      amount: template.amount,
      type: template.type,
      categoryId: template.categoryId,
      walletId: template.walletId,
      templateId: template.id,
      note: template.note,
      createdAt: template.nextRunAt,
      updatedAt: runAtIso,
    };
    await tx.objectStore("transactions").put(transaction);
    const nextTemplate: RecurringTemplate = {
      ...template,
      nextRunAt: addInterval(template.nextRunAt, template.frequency),
      updatedAt: runAtIso,
    };
    await tx.objectStore("recurringTemplates").put(nextTemplate);
    createdCount += 1;
  }
  await tx.done;
  return createdCount;
}

export async function getWallets() {
  const db = await getDb();
  const rows = await db.getAll("wallets");
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addWallet(input: NewWallet) {
  const db = await getDb();
  const now = new Date().toISOString();
  const row: Wallet = {
    id: generateId(),
    name: input.name.trim(),
    type: input.type,
    startingBalance: input.startingBalance ?? 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.put("wallets", row);
  return row;
}

export async function updateWallet(
  id: string,
  input: Partial<Omit<Wallet, "id" | "createdAt" | "updatedAt">>,
) {
  const db = await getDb();
  const existing = await db.get("wallets", id);
  if (!existing) return null;
  const next: Wallet = {
    ...existing,
    ...input,
    name: input.name?.trim() ?? existing.name,
    updatedAt: new Date().toISOString(),
  };
  await db.put("wallets", next);
  return next;
}

export async function getTransfers() {
  const db = await getDb();
  const rows = await db.getAll("transfers");
  return rows.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function addTransfer(input: NewTransfer) {
  const db = await getDb();
  const now = input.createdAt ?? new Date().toISOString();
  const row: Transfer = {
    id: generateId(),
    fromWalletId: input.fromWalletId,
    toWalletId: input.toWalletId,
    amount: input.amount,
    note: input.note?.trim(),
    createdAt: now,
    updatedAt: now,
  };
  await db.put("transfers", row);
  return row;
}

export async function updateTransfer(
  id: string,
  input: Partial<Omit<Transfer, "id" | "createdAt" | "updatedAt">>,
) {
  const db = await getDb();
  const existing = await db.get("transfers", id);
  if (!existing) return null;
  const next: Transfer = {
    ...existing,
    ...input,
    note: "note" in input ? input.note?.trim() : existing.note,
    updatedAt: new Date().toISOString(),
  };
  await db.put("transfers", next);
  return next;
}

export async function deleteTransfer(id: string) {
  const db = await getDb();
  await db.delete("transfers", id);
}

export async function getGoals() {
  const db = await getDb();
  const rows = await db.getAll("goals");
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addGoal(input: NewGoal) {
  const db = await getDb();
  const now = new Date().toISOString();
  const row: Goal = {
    id: generateId(),
    name: input.name.trim(),
    targetAmount: input.targetAmount,
    currentAmount: input.currentAmount ?? 0,
    walletId: input.walletId,
    deadline: input.deadline,
    createdAt: now,
    updatedAt: now,
  };
  await db.put("goals", row);
  return row;
}

export async function updateGoal(
  id: string,
  input: Partial<Omit<Goal, "id" | "createdAt" | "updatedAt">>,
) {
  const db = await getDb();
  const existing = await db.get("goals", id);
  if (!existing) return null;
  const next: Goal = {
    ...existing,
    ...input,
    name: input.name?.trim() ?? existing.name,
    updatedAt: new Date().toISOString(),
  };
  await db.put("goals", next);
  return next;
}

export async function deleteGoal(id: string) {
  const db = await getDb();
  await db.delete("goals", id);
}

export async function getDebts() {
  const db = await getDb();
  const rows = await db.getAll("debts");
  return rows
    .map((row) => normalizeDebt(row))
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function addDebt(input: NewDebt) {
  const db = await getDb();
  const now = input.createdAt ?? new Date().toISOString();
  const row: Debt = {
    id: generateId(),
    title: input.title.trim(),
    amount: input.amount,
    kind: input.kind,
    institutionalSubtype:
      input.kind === "institutional" ? input.institutionalSubtype ?? "other" : undefined,
    direction: input.direction,
    status: input.status ?? "open",
    person: input.person?.trim() || undefined,
    dueAt: input.dueAt,
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  await db.put("debts", row);
  return row;
}

export async function updateDebt(
  id: string,
  input: Partial<Omit<Debt, "id" | "createdAt" | "updatedAt">>,
) {
  const db = await getDb();
  const existing = await db.get("debts", id);
  if (!existing) return null;
  const next: Debt = {
    ...existing,
    ...input,
    title: input.title?.trim() ?? existing.title,
    institutionalSubtype:
      (input.kind ?? existing.kind) === "institutional"
        ? input.institutionalSubtype ?? existing.institutionalSubtype ?? "other"
        : undefined,
    person: "person" in input ? input.person?.trim() || undefined : existing.person,
    note: "note" in input ? input.note?.trim() || undefined : existing.note,
    updatedAt: new Date().toISOString(),
  };
  const normalized = normalizeDebt(next);
  await db.put("debts", normalized);
  return normalized;
}

export async function deleteDebt(id: string) {
  const db = await getDb();
  await db.delete("debts", id);
}

export async function exportData(): Promise<ExportPayload> {
  const db = await getDb();
  const [
    categories,
    transactions,
    preferences,
    budgets,
    recurringTemplates,
    wallets,
    transfers,
    goals,
    debts,
  ] = await Promise.all([
    db.getAll("categories"),
    db.getAll("transactions"),
    db.get("preferences", "prefs"),
    db.getAll("budgets"),
    db.getAll("recurringTemplates"),
    db.getAll("wallets"),
    db.getAll("transfers"),
    db.getAll("goals"),
    db.getAll("debts"),
  ]);

  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    categories,
    transactions,
    budgets,
    recurringTemplates,
    wallets,
    transfers,
    goals,
    debts: debts.map((row) => normalizeDebt(row)),
    preferences: preferences ?? DEFAULT_PREFERENCES,
  };
}

export async function importData(payload: ExportPayload) {
  const db = await getDb();
  const tx = db.transaction(
    [
      "categories",
      "transactions",
      "preferences",
      "budgets",
      "recurringTemplates",
      "wallets",
      "transfers",
      "goals",
      "debts",
    ],
    "readwrite",
  );
  await tx.objectStore("categories").clear();
  await tx.objectStore("transactions").clear();
  await tx.objectStore("preferences").clear();
  await tx.objectStore("budgets").clear();
  await tx.objectStore("recurringTemplates").clear();
  await tx.objectStore("wallets").clear();
  await tx.objectStore("transfers").clear();
  await tx.objectStore("goals").clear();
  await tx.objectStore("debts").clear();

  for (const category of payload.categories) {
    await tx.objectStore("categories").put(category);
  }
  for (const transaction of payload.transactions) {
    await tx.objectStore("transactions").put(transaction);
  }
  for (const budget of payload.budgets ?? []) {
    await tx.objectStore("budgets").put(budget);
  }
  for (const template of payload.recurringTemplates ?? []) {
    await tx.objectStore("recurringTemplates").put(template);
  }
  for (const wallet of payload.wallets ?? DEFAULT_WALLETS) {
    await tx.objectStore("wallets").put(wallet);
  }
  for (const transfer of payload.transfers ?? []) {
    await tx.objectStore("transfers").put(transfer);
  }
  for (const goal of payload.goals ?? []) {
    await tx.objectStore("goals").put(goal);
  }
  for (const debt of payload.debts ?? []) {
    await tx.objectStore("debts").put(normalizeDebt(debt as Debt));
  }
  await tx.objectStore("preferences").put(payload.preferences);
  await tx.done;
}

export async function resetData() {
  const db = await getDb();
  const tx = db.transaction(
    [
      "categories",
      "transactions",
      "preferences",
      "budgets",
      "recurringTemplates",
      "wallets",
      "transfers",
      "goals",
      "debts",
    ],
    "readwrite",
  );
  await tx.objectStore("transactions").clear();
  await tx.objectStore("categories").clear();
  await tx.objectStore("preferences").clear();
  await tx.objectStore("budgets").clear();
  await tx.objectStore("recurringTemplates").clear();
  await tx.objectStore("wallets").clear();
  await tx.objectStore("transfers").clear();
  await tx.objectStore("goals").clear();
  await tx.objectStore("debts").clear();
  for (const category of DEFAULT_CATEGORIES) {
    await tx.objectStore("categories").put(category);
  }
  await tx.objectStore("preferences").put(DEFAULT_PREFERENCES);
  for (const wallet of DEFAULT_WALLETS) {
    await tx.objectStore("wallets").put(wallet);
  }
  await tx.done;
}
