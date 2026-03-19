export function formatCurrency(amount: number, locale: string, currency: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateIso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateIso));
}

export function searchableDateTerms(dateIso: string, locale: string) {
  const date = new Date(dateIso);
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
    formatDate(dateIso, locale).toLowerCase(),
    shortMonth,
    longMonth,
    `${day}/${monthNumber}/${year}`,
    `${day}-${monthNumber}-${year}`,
    `${year}-${monthNumber}-${day}`,
    `${monthNumber}/${day}/${year}`,
  ];
}

export function dateTimeLocalValue(dateIso: string) {
  const date = new Date(dateIso);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
