import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
} from "viem";
import { mockUsdcAbi } from "./abi/mockUsdc";
import { trueAlertAbi } from "./abi/trueAlert";

/**
 * TrueAlert's ABI plus the ERC-20 errors a token transfer can bubble up
 * (OpenZeppelin's ERC20InsufficientBalance etc.), so reverts from inside
 * `fund`/`payInvoice` decode to a name instead of raw bytes.
 */
export const trueAlertAppAbi = [
  ...trueAlertAbi,
  ...mockUsdcAbi.filter((item) => item.type === "error"),
] as const;

const byErrorName: Record<string, string> = {
  // Terms / links
  TermsExpired: "This payment link has expired. Ask the seller for a new one.",
  TermsAlreadyUsed: "This invoice has already been paid.",
  InvalidSignature: "This link wasn't signed by the seller. Don't pay it.",
  WrongMode: "This link is for a different kind of payment.",
  TokenNotAllowed: "This currency isn't accepted by TrueAlert any more.",
  ZeroAmount: "This invoice has no amount.",
  NotDesignatedBuyer: "This link is reserved for a different customer's wallet.",
  WrongValue: "The amount sent doesn't match the invoice.",
  NativeTransferFailed: "The ETN transfer failed. The seller's wallet may not accept ETN.",
  EnforcedPause: "TrueAlert has paused new payments for now. Please try again later.",
  // Protected orders
  SellerCannotBuy: "You can't pay for your own order.",
  InvalidWindows: "This order has invalid delivery times. Ask the seller for a new link.",
  InvalidArbiter: "This order has an invalid referee. Ask the seller for a new link.",
  NotSeller: "Only the seller can do that.",
  NotBuyer: "Only the buyer who paid can do that.",
  NotArbiter: "Only the order's referee can do that.",
  InvalidStatus: "The order has moved on. Refresh to see its latest status.",
  DeadlinePassed: "That deadline has already passed.",
  DeadlineNotReached: "It's too early for that. Wait until the deadline passes.",
  AlreadyExtended: "You've already extended this order once.",
  InvalidExtension: "Extensions can be up to 48 hours.",
  NoArbiter: "This order has no referee, so it can't be disputed.",
  InvalidShare: "That split is more than the order amount.",
  // Token
  ERC20InsufficientBalance: "You don't have enough USDC for this payment.",
  ERC20InsufficientAllowance: "Approve USDC for TrueAlert first.",
};

export function errorName(err: unknown): string | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (reverted instanceof ContractFunctionRevertedError) return reverted.data?.errorName;
  return undefined;
}

/** A short, human message for any error from a wallet or contract call. */
export function friendlyError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) {
      return "You cancelled the request in your wallet.";
    }
    if (err.walk((e) => e instanceof InsufficientFundsError)) {
      return "Not enough ETN to pay the network fee.";
    }
    const name = errorName(err);
    if (name && byErrorName[name]) return byErrorName[name];
    return err.shortMessage || "Something went wrong. Please try again.";
  }
  if (err instanceof Error && /user (rejected|denied)/i.test(err.message)) {
    return "You cancelled the request in your wallet.";
  }
  return "Something went wrong. Please try again.";
}
