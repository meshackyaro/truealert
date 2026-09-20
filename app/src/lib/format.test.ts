import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatNaira,
  formatTimeLeft,
  formatTokenAmount,
  shortAddress,
} from "./format";

describe("formatNaira", () => {
  it("groups thousands with the naira sign", () => {
    expect(formatNaira("15000")).toBe("₦15,000");
    expect(formatNaira("2500.5")).toBe("₦2,500.50");
    expect(formatNaira("17500.5")).toBe("₦17,500.50");
  });
});

describe("formatTokenAmount", () => {
  it("formats USDC to 2 dp", () => {
    expect(formatTokenAmount(10_922_754n, 6)).toBe("10.92");
  });

  it("groups large ETN amounts", () => {
    expect(formatTokenAmount(9_600_123_000_000_000_000_000n, 18)).toBe("9,600.12");
  });

  it("drops trailing zeros", () => {
    expect(formatTokenAmount(10_000_000n, 6)).toBe("10");
    expect(formatTokenAmount(10_500_000n, 6)).toBe("10.5");
  });

  it("never shows a tiny non-zero amount as 0", () => {
    expect(formatTokenAmount(1n, 6)).toBe("<0.01");
  });
});

describe("shortAddress", () => {
  it("keeps the first 6 and last 4 characters", () => {
    expect(shortAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8")).toBe("0x7099…79C8");
  });
});

describe("formatDuration", () => {
  it("formats the delivery presets", () => {
    expect(formatDuration(86_400)).toBe("24 hours");
    expect(formatDuration(3 * 86_400)).toBe("3 days");
    expect(formatDuration(5 * 86_400)).toBe("5 days");
    expect(formatDuration(12 * 3_600)).toBe("12 hours");
    expect(formatDuration(48 * 3_600)).toBe("2 days");
  });

  it("formats short durations", () => {
    expect(formatDuration(5_400)).toBe("1 hour 30 min");
    expect(formatDuration(900)).toBe("15 min");
    expect(formatDuration(30)).toBe("under a minute");
  });

  it("formats mixed day/hour durations in hours", () => {
    expect(formatDuration(86_400 + 6 * 3_600)).toBe("30 hours");
  });
});

describe("formatTimeLeft", () => {
  it("counts down to a deadline", () => {
    expect(formatTimeLeft(1_000 + 900, 1_000)).toBe("15 min left");
    expect(formatTimeLeft(1_000 + 30, 1_000)).toBe("under a minute left");
    expect(formatTimeLeft(999, 1_000)).toBe("expired");
  });
});
