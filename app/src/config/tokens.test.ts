import { zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { ETN, findToken, type Token } from "./tokens";

const USDC: Token = {
  address: "0x3187deAd7A2Bd6770F5Fe81495D1B715926AAe6e",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  native: false,
};

describe("findToken", () => {
  const list = [ETN, USDC];

  it("finds native ETN by the zero address", () => {
    expect(findToken(zeroAddress, list)).toBe(ETN);
  });

  it("matches addresses case-insensitively", () => {
    expect(findToken(USDC.address.toLowerCase(), list)).toBe(USDC);
  });

  it("rejects tokens that aren't on the list", () => {
    expect(findToken("0x227c1e7373eD9300C93DA8fe25c18549bb107880", list)).toBeUndefined();
  });

  it("rejects garbage", () => {
    expect(findToken("<img src=x onerror=alert(1)>", list)).toBeUndefined();
  });
});
