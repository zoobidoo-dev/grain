import { describe, expect, it } from "vitest";
import { parseSmartQuery, summarizeDebts } from "./finance";

describe("parseSmartQuery", () => {
  it("parses explicit month and year filters", () => {
    const parsed = parseSmartQuery("month:jan year:2025 cat:food wallet:main type:expense");

    expect(parsed.month).toBe(0);
    expect(parsed.year).toBe(2025);
    expect(parsed.category).toBe("food");
    expect(parsed.wallet).toBe("main");
    expect(parsed.type).toBe("expense");
  });

  it("keeps bare numbers as searchable text", () => {
    const parsed = parseSmartQuery("2024 rent 1000");

    expect(parsed.year).toBeUndefined();
    expect(parsed.text).toEqual(["2024", "rent", "1000"]);
  });

  it("parses month aliases", () => {
    expect(parseSmartQuery("jan").month).toBe(0);
    expect(parseSmartQuery("month:dec").month).toBe(11);
    expect(parseSmartQuery("march").month).toBe(2);
  });
});

describe("summarizeDebts", () => {
  it("totals open records by direction", () => {
    const summary = summarizeDebts([
      {
        id: "lent-1",
        title: "Lunch",
        amount: 50,
        kind: "lent",
        direction: "owed_to_me",
        status: "open",
        createdAt: "2026-03-01T10:00:00.000Z",
        updatedAt: "2026-03-01T10:00:00.000Z",
      },
      {
        id: "loan-1",
        title: "Card due",
        amount: 20,
        kind: "institutional",
        institutionalSubtype: "credit_card",
        direction: "i_owe",
        status: "open",
        createdAt: "2026-03-02T10:00:00.000Z",
        updatedAt: "2026-03-02T10:00:00.000Z",
      },
      {
        id: "done-1",
        title: "Settled",
        amount: 10,
        kind: "borrowed",
        direction: "i_owe",
        status: "settled",
        createdAt: "2026-03-03T10:00:00.000Z",
        updatedAt: "2026-03-03T10:00:00.000Z",
      },
    ]);

    expect(summary.receivable).toBe(50);
    expect(summary.payable).toBe(20);
    expect(summary.net).toBe(30);
    expect(summary.openCount).toBe(2);
  });
});
