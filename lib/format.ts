export function formatCurrency(amount: number, locale: string, currency: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function parseDateInput(dateInput: string, referenceDate = new Date()) {
  const trimmed = dateInput.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();
  const relativeDate = new Date(referenceDate);

  if (normalized === "today") {
    return relativeDate.toISOString();
  }

  if (normalized === "yesterday") {
    relativeDate.setDate(relativeDate.getDate() - 1);
    return relativeDate.toISOString();
  }

  if (normalized === "tomorrow") {
    relativeDate.setDate(relativeDate.getDate() + 1);
    return relativeDate.toISOString();
  }

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, yearText, monthText, dayText] = dateOnlyMatch;
    const nextDate = new Date(referenceDate);
    nextDate.setFullYear(Number(yearText), Number(monthText) - 1, Number(dayText));
    nextDate.setSeconds(0, 0);
    return nextDate.toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function normalizeDateInput(dateInput: string | undefined, referenceDate = new Date()) {
  if (!dateInput?.trim()) {
    return referenceDate.toISOString();
  }

  return parseDateInput(dateInput, referenceDate) ?? referenceDate.toISOString();
}

export function formatDate(dateIso: string, locale: string) {
  const parsed = parseDateInput(dateIso);
  if (!parsed) {
    return dateIso;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(parsed));
}

export function searchableDateTerms(dateIso: string, locale: string) {
  const parsed = parseDateInput(dateIso);
  if (!parsed) {
    return [dateIso.toLowerCase()];
  }

  const date = new Date(parsed);
  const shortMonth = new Intl.DateTimeFormat(locale, { month: "short" })
    .format(date)
    .toLowerCase();
  const longMonth = new Intl.DateTimeFormat(locale, { month: "long" })
    .format(date)
    .toLowerCase();
  const year = String(date.getFullYear());
  const monthNumber = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return [
    formatDate(parsed, locale).toLowerCase(),
    shortMonth,
    longMonth,
    `${day}/${monthNumber}/${year}`,
    `${day}-${monthNumber}-${year}`,
    `${year}-${monthNumber}-${day}`,
    `${monthNumber}/${day}/${year}`,
  ];
}

export function dateTimeLocalValue(dateIso: string) {
  const parsed = parseDateInput(dateIso) ?? new Date().toISOString();
  const date = new Date(parsed);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
