import * as XLSX from "xlsx";
import type { TransactionType } from "@/lib/types";

export type ParsedStatementRow = {
  createdAt: string;
  amount: number;
  type: TransactionType;
  description: string;
  source: string;
};

export type ParsedStatementFile = {
  rows: ParsedStatementRow[];
  warnings: string[];
};

export class StatementPasswordError extends Error {
  constructor(message = "This statement is password protected.") {
    super(message);
    this.name = "StatementPasswordError";
  }
}

const DATE_HEADER_PATTERNS = [
  "date",
  "txn date",
  "transaction date",
  "post date",
  "value date",
];

const DESCRIPTION_HEADER_PATTERNS = [
  "description",
  "narration",
  "remarks",
  "particulars",
  "details",
  "merchant",
  "payee",
  "transaction details",
];

const DEBIT_HEADER_PATTERNS = ["debit", "withdrawal", "dr"];
const CREDIT_HEADER_PATTERNS = ["credit", "deposit", "cr"];
const AMOUNT_HEADER_PATTERNS = ["amount", "transaction amount"];
const TYPE_HEADER_PATTERNS = ["type", "transaction type", "dr/cr"];

function normalizeHeaderCell(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseAmount(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const cleaned = text.replace(/[,\s₹$]/g, "");
  const negativeByParens = cleaned.startsWith("(") && cleaned.endsWith(")");
  const normalized = cleaned.replace(/[()]/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount === 0) return undefined;
  return negativeByParens ? -amount : amount;
}

function buildIsoDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0).toISOString();
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return buildIsoDate(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return buildIsoDate(parsed.y, parsed.m - 1, parsed.d);
    }
  }

  const text = String(value ?? "").trim();
  if (!text) return undefined;

  const dayFirst = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dayFirst) {
    const [, dayText, monthText, yearText] = dayFirst;
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    return buildIsoDate(year, Number(monthText) - 1, Number(dayText));
  }

  const isoLike = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoLike) {
    const [, yearText, monthText, dayText] = isoLike;
    return buildIsoDate(Number(yearText), Number(monthText) - 1, Number(dayText));
  }

  const native = new Date(text);
  if (!Number.isNaN(native.getTime())) {
    return buildIsoDate(native.getFullYear(), native.getMonth(), native.getDate());
  }

  return undefined;
}

function matchesAnyHeader(header: string, patterns: string[]) {
  return patterns.some((pattern) => header === pattern || header.includes(pattern));
}

function detectHeaderRow(rows: unknown[][]) {
  let bestIndex = 0;
  let bestScore = -1;

  rows.slice(0, 8).forEach((row, index) => {
    const headers = row.map(normalizeHeaderCell);
    const score = headers.reduce((sum, header) => {
      if (!header) return sum;
      if (
        matchesAnyHeader(header, DATE_HEADER_PATTERNS) ||
        matchesAnyHeader(header, DESCRIPTION_HEADER_PATTERNS) ||
        matchesAnyHeader(header, DEBIT_HEADER_PATTERNS) ||
        matchesAnyHeader(header, CREDIT_HEADER_PATTERNS) ||
        matchesAnyHeader(header, AMOUNT_HEADER_PATTERNS) ||
        matchesAnyHeader(header, TYPE_HEADER_PATTERNS)
      ) {
        return sum + 1;
      }
      return sum;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function findColumnIndex(headers: string[], patterns: string[]) {
  return headers.findIndex((header) => matchesAnyHeader(header, patterns));
}

function inferType(
  amount: number,
  explicitType: unknown,
  description: string,
): TransactionType {
  const typeText = String(explicitType ?? "").toLowerCase();
  const text = `${typeText} ${description}`.toLowerCase();
  if (amount < 0) return "expense";
  if (/(debit|dr|purchase|withdraw|paid|payment|sent)/.test(text)) return "expense";
  if (/(credit|cr|salary|refund|received|deposit)/.test(text)) return "income";
  return "income";
}

function mapSheetRows(rows: unknown[][], source: string): ParsedStatementFile {
  if (!rows.length) {
    return { rows: [], warnings: ["The file did not contain any rows."] };
  }

  const headerIndex = detectHeaderRow(rows);
  const headers = rows[headerIndex].map(normalizeHeaderCell);
  const dataRows = rows.slice(headerIndex + 1);

  const dateColumn = findColumnIndex(headers, DATE_HEADER_PATTERNS);
  const descriptionColumn = findColumnIndex(headers, DESCRIPTION_HEADER_PATTERNS);
  const debitColumn = findColumnIndex(headers, DEBIT_HEADER_PATTERNS);
  const creditColumn = findColumnIndex(headers, CREDIT_HEADER_PATTERNS);
  const amountColumn = findColumnIndex(headers, AMOUNT_HEADER_PATTERNS);
  const typeColumn = findColumnIndex(headers, TYPE_HEADER_PATTERNS);

  const warnings: string[] = [];
  const parsedRows = dataRows.flatMap((row, rowIndex) => {
    const dateValue = dateColumn >= 0 ? row[dateColumn] : row[0];
    const createdAt = parseDate(dateValue);
    if (!createdAt) return [];

    const descriptionValue = descriptionColumn >= 0 ? row[descriptionColumn] : row[1];
    const description = String(descriptionValue ?? "").trim() || "Imported statement row";

    const debit = debitColumn >= 0 ? parseAmount(row[debitColumn]) : undefined;
    const credit = creditColumn >= 0 ? parseAmount(row[creditColumn]) : undefined;
    const rawAmount = amountColumn >= 0 ? parseAmount(row[amountColumn]) : undefined;
    const signedAmount =
      debit !== undefined
        ? -Math.abs(debit)
        : credit !== undefined
          ? Math.abs(credit)
          : rawAmount;

    if (signedAmount === undefined) {
      warnings.push(`Skipped row ${headerIndex + rowIndex + 2}: amount was not detected.`);
      return [];
    }

    return [
      {
        createdAt,
        amount: Math.abs(signedAmount),
        type: inferType(signedAmount, typeColumn >= 0 ? row[typeColumn] : "", description),
        description,
        source,
      },
    ];
  });

  if (!parsedRows.length && warnings.length === 0) {
    warnings.push("No transaction rows were detected in this statement.");
  }

  return { rows: parsedRows, warnings };
}

function parsePdfLine(line: string, source: string): ParsedStatementRow | null {
  const trimmed = line.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  const dateMatch = trimmed.match(
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
  );
  if (!dateMatch) return null;

  const createdAt = parseDate(dateMatch[1]);
  if (!createdAt) return null;

  const amountMatches = [...trimmed.matchAll(/-?\d[\d,]*\.\d{2}/g)].map((match) => match[0]);
  if (!amountMatches.length) return null;

  const rawAmount = amountMatches.length > 1
    ? amountMatches[amountMatches.length - 2]
    : amountMatches[0];
  const signedAmount = parseAmount(rawAmount);
  if (signedAmount === undefined) return null;

  const description = trimmed
    .replace(dateMatch[0], "")
    .replace(rawAmount, "")
    .trim();

  return {
    createdAt,
    amount: Math.abs(signedAmount),
    type: inferType(signedAmount, "", description),
    description: description || "Imported PDF statement row",
    source,
  };
}

function isPasswordError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("password") ||
    message.includes("encrypted") ||
    message.includes("protection")
  );
}

async function loadPdf(file: File, password?: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const buffer = await file.arrayBuffer();
  try {
    return await pdfjs.getDocument({ data: buffer, password }).promise;
  } catch (error) {
    if (isPasswordError(error)) {
      throw new StatementPasswordError(
        password ? "Incorrect statement password." : "Statement password required.",
      );
    }
    throw error;
  }
}

async function parsePdf(file: File, password?: string): Promise<ParsedStatementFile> {
  const pdf = await loadPdf(file, password);
  const rows: ParsedStatementRow[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lineMap = new Map<number, string[]>();

    for (const item of content.items) {
      if (!("str" in item) || !("transform" in item)) continue;
      const y = Math.round(item.transform[5]);
      const existing = lineMap.get(y) ?? [];
      existing.push(item.str);
      lineMap.set(y, existing);
    }

    const orderedLines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.join(" ").replace(/\s+/g, " ").trim());

    for (const line of orderedLines) {
      const parsed = parsePdfLine(line, file.name);
      if (parsed) rows.push(parsed);
    }
  }

  return {
    rows,
    warnings: rows.length ? [] : ["No transaction rows were detected in the PDF statement."],
  };
}

async function parseSpreadsheet(
  file: File,
  password?: string,
): Promise<ParsedStatementFile> {
  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      raw: true,
      password,
    });
  } catch (error) {
    if (isPasswordError(error)) {
      throw new StatementPasswordError(
        password ? "Incorrect statement password." : "Statement password required.",
      );
    }
    throw error;
  }

  const allRows = workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      blankrows: false,
      defval: "",
    }) as unknown[][];
    return rows;
  });

  return mapSheetRows(allRows, file.name);
}

export async function parseStatementFile(
  file: File,
  password?: string,
): Promise<ParsedStatementFile> {
  const lowercaseName = file.name.toLowerCase();
  if (lowercaseName.endsWith(".pdf")) {
    return parsePdf(file, password);
  }

  if (
    lowercaseName.endsWith(".csv") ||
    lowercaseName.endsWith(".xls") ||
    lowercaseName.endsWith(".xlsx")
  ) {
    return parseSpreadsheet(file, password);
  }

  throw new Error("Unsupported file type. Use PDF, CSV, XLS, or XLSX.");
}
