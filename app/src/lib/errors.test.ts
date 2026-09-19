import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  UserRejectedRequestError,
  zeroAddress,
} from "viem";
import { describe, expect, it } from "vitest";
import { errorName, friendlyError, trueAlertAppAbi } from "./errors";

function revert(errorName: string, args?: readonly unknown[]) {
  const data = encodeErrorResult({
    abi: trueAlertAppAbi,
    errorName,
    args,
  } as Parameters<typeof encodeErrorResult>[0]);
  const cause = new ContractFunctionRevertedError({
    abi: trueAlertAppAbi,
    data,
    functionName: "paused", // no args needed to format the error
  });
  return new ContractFunctionExecutionError(cause, {
    abi: trueAlertAppAbi,
    functionName: "paused", // no args needed to format the error
    contractAddress: zeroAddress,
  });
}

describe("friendlyError", () => {
  it("explains TrueAlert custom errors", () => {
    expect(friendlyError(revert("TermsExpired"))).toMatch(/expired/);
    expect(friendlyError(revert("TermsAlreadyUsed"))).toBe("This invoice has already been paid.");
    expect(errorName(revert("InvalidStatus", [2]))).toBe("InvalidStatus");
  });

  it("decodes ERC-20 errors bubbled up from the token", () => {
    const err = revert("ERC20InsufficientBalance", [zeroAddress, 1n, 2n]);
    expect(friendlyError(err)).toBe("You don't have enough USDC for this payment.");
  });

  it("recognises a cancelled wallet request", () => {
    const err = new UserRejectedRequestError(new Error("User rejected the request."));
    expect(friendlyError(err)).toBe("You cancelled the request in your wallet.");
  });

  it("falls back to a generic message", () => {
    expect(friendlyError("boom")).toBe("Something went wrong. Please try again.");
  });
});
