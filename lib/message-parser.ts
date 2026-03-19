import { dateTimeLocalValue } from "@/lib/format";
import type { TransactionType } from "@/lib/types";

export type ParsedMessageTransaction = {
  amount?: string;
  createdAt?: string;
  note?: string;
  type?: TransactionType;
  sourceText: string;
};

const AMOUNT_PATTERNS = [
  /(?:rs\.?|inr|mrp)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
  /(?:debited|credited|spent|received|payment of|txn of|amount of)\s*(?:rs\.?|inr)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
  /([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:rs\.?|inr)/i,
];

const DATE_PATTERNS = [
  /(\d{4})-(\d{2})-(\d{2})[ t](\d{2}):(\d{2})/,
  /(\d{2})\/(\d{2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i,
  /(\d{2})-(\d{2})-(\d{4})[ ,]+(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i,
  /(\d{2})\/(\d{2})\/(\d{4})/,
  /(\d{2})-(\d{2})-(\d{4})/,
];

function normalizeAmount(rawAmount: string) {
  const normalized = Number(rawAmount.replace(/,/g, ""));
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return undefined;
  }
  return normalized.toString();
}

function toLocalInputValue(date: Date) {
  return dateTimeLocalValue(date.toISOString());
}

function parseDateFromMessage(sourceText: string) {
  for (const pattern of DATE_PATTERNS) {
    const match = sourceText.match(pattern);
    if (!match) continue;

    if (pattern === DATE_PATTERNS[0]) {
      const [, year, month, day, hours, minutes] = match;
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    if (pattern === DATE_PATTERNS[1] || pattern === DATE_PATTERNS[2]) {
      const [, day, month, year, rawHours, minutes, meridiem] = match;
      let hours = Number(rawHours);
      if (meridiem) {
        const meridiemLower = meridiem.toLowerCase();
        if (meridiemLower === "pm" && hours < 12) hours += 12;
        if (meridiemLower === "am" && hours === 12) hours = 0;
      }
      return `${year}-${month}-${day}T${hours.toString().padStart(2, "0")}:${minutes}`;
    }

    if (pattern === DATE_PATTERNS[3] || pattern === DATE_PATTERNS[4]) {
      const [, day, month, year] = match;
      return `${year}-${month}-${day}T${toLocalInputValue(new Date()).slice(11, 16)}`;
    }
  }

  return undefined;
}

function parseTypeFromMessage(sourceText: string): TransactionType | undefined {
  if (/(credited|received|deposit|refund)/i.test(sourceText)) {
    return "income";
  }
  if (/(debited|spent|purchase|paid|payment|withdrawn)/i.test(sourceText)) {
    return "expense";
  }
  return undefined;
}

export function parseTransactionFromMessage(sourceText: string): ParsedMessageTransaction {
  const normalizedText = sourceText.trim().replace(/\s+/g, " ");
  if (!normalizedText) {
    return { sourceText: "" };
  }

  const amount = AMOUNT_PATTERNS.map((pattern) => normalizedText.match(pattern)?.[1])
    .find(Boolean);

  const createdAt = parseDateFromMessage(normalizedText) ?? toLocalInputValue(new Date());

  return {
    amount: amount ? normalizeAmount(amount) : undefined,
    createdAt,
    note: normalizedText,
    type: parseTypeFromMessage(normalizedText),
    sourceText: normalizedText,
  };
}
