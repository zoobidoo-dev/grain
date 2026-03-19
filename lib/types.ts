export type TransactionType = "expense" | "income";

export type SplitItem = {
  id: string;
  categoryId: string;
  amount: number;
};

export type Transaction = {
  id: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  walletId: string;
  templateId?: string;
  transferId?: string;
  splits?: SplitItem[];
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Preferences = {
  id: "prefs";
  currency: string;
  locale: string;
  defaultWalletId?: string;
};

export type Budget = {
  id: string;
  month: string;
  categoryId: string;
  limitAmount: number;
  createdAt: string;
  updatedAt: string;
};

export type RecurringFrequency = "weekly" | "monthly";

export type RecurringTemplate = {
  id: string;
  name: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  walletId: string;
  note?: string;
  frequency: RecurringFrequency;
  nextRunAt: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WalletType = "cash" | "bank" | "card";

export type Wallet = {
  id: string;
  name: string;
  type: WalletType;
  startingBalance: number;
  createdAt: string;
  updatedAt: string;
};

export type Transfer = {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  walletId?: string;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
};

export type DebtKind = "lent" | "borrowed" | "institutional";

export type InstitutionalDebtSubtype = "loan" | "credit_card" | "other";

export type DebtDirection = "owed_to_me" | "i_owe";

export type DebtStatus = "open" | "settled";

export type Debt = {
  id: string;
  title: string;
  amount: number;
  kind: DebtKind;
  institutionalSubtype?: InstitutionalDebtSubtype;
  direction: DebtDirection;
  status: DebtStatus;
  person?: string;
  dueAt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type ExportPayload = {
  version: 2 | 3;
  exportedAt: string;
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringTemplates: RecurringTemplate[];
  wallets: Wallet[];
  transfers: Transfer[];
  goals: Goal[];
  debts?: Debt[];
  preferences: Preferences;
};
