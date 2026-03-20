import { describe, expect, it } from "vitest";
import {
  formatDate,
  normalizeDateInput,
  parseDateInput,
} from "./format";

describe("parseDateInput", () => {
  it("normalizes relative voice dates", () => {
    const reference = new Date("2026-03-20T10:30:00.000Z");

    expect(parseDateInput("today", reference)).toBe("2026-03-20T10:30:00.000Z");
    expect(parseDateInput("yesterday", reference)).toBe("2026-03-19T10:30:00.000Z");
    expect(parseDateInput("tomorrow", reference)).toBe("2026-03-21T10:30:00.000Z");
  });

  it("returns null for invalid date strings", () => {
    expect(parseDateInput("next salary day")).toBeNull();
  });
});

describe("normalizeDateInput", () => {
  it("falls back to the reference date for invalid input", () => {
    const reference = new Date("2026-03-20T10:30:00.000Z");

    expect(normalizeDateInput("next salary day", reference)).toBe("2026-03-20T10:30:00.000Z");
  });
});

describe("formatDate", () => {
  it("does not throw for invalid saved dates", () => {
    expect(formatDate("today", "en-US")).toBeTruthy();
    expect(formatDate("not-a-real-date", "en-US")).toBe("not-a-real-date");
  });
});
