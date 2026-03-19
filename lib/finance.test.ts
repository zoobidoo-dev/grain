import { describe, expect, it } from "vitest";
import { parseSmartQuery } from "./finance";

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
