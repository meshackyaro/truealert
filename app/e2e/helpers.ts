// Shared plumbing for the end-to-end suites (local anvil chain + `pnpm dev`).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { createPublicClient, createWalletClient, erc20Abi, http, type Address, type Hex } from "viem";
import { foundry } from "viem/chains";
import { trueAlertAbi } from "../src/lib/abi/trueAlert";
import { decodeLink } from "../src/lib/link";
import { injectTestWallet } from "./testWallet";

export const RPC = "http://127.0.0.1:8545";
export const APP = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const BUYER: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // anvil #2
export const SELLER: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // anvil #1
export const shots = join(__dirname, "screenshots");
mkdirSync(shots, { recursive: true });

export const client = createPublicClient({ chain: foundry, transport: http(RPC) });
// Anvil accounts are unlocked, so the node signs for the seller.
const sellerWallet = createWalletClient({ account: SELLER, chain: foundry, transport: http(RPC) });

export function envAddress(name: string): Address {
  const out = execFileSync("grep", [`^${name}=`, join(__dirname, "..", ".env.local")], { encoding: "utf8" });
  return out.trim().split("=")[1] as Address;
}
export const trueAlert = () => envAddress("NEXT_PUBLIC_TRUEALERT_ADDRESS");
export const usdc = () => envAddress("NEXT_PUBLIC_USDC_ADDRESS");

export const usdcBalance = (owner: Address) =>
  client.readContract({ address: usdc(), abi: erc20Abi, functionName: "balanceOf", args: [owner] });

export function orderId(url: string): Hex {
  const result = decodeLink(new URL(url).searchParams.get("d")!);
  if (!result.ok) throw new Error(result.error);
  return result.payload.terms.id;
}

export async function orderStatus(id: Hex) {
  return (await client.readContract({ address: trueAlert(), abi: trueAlertAbi, functionName: "getOrder", args: [id] }))
    .status;
}

export async function sellerDoes(functionName: "markShipped" | "claim" | "cancel", id: Hex) {
  const hash = await sellerWallet.writeContract({ address: trueAlert(), abi: trueAlertAbi, functionName, args: [id] });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`seller ${functionName} reverted`);
}

/** Fast-forward the chain clock and mine a block. */
export async function warp(seconds: number) {
  await client.request({ method: "evm_increaseTime" as never, params: [seconds] as never });
  await client.request({ method: "evm_mine" as never, params: [] as never });
}

export async function setEtnBalance(account: Address, weiHex: string) {
  await client.request({ method: "anvil_setBalance" as never, params: [account, weiHex] as never });
}

/**
 * Connects the injected test wallet via the page's connect button, unless the
 * wallet already reconnected by itself (it remembers approval, like MetaMask).
 */
export async function connect(page: Page, prompt: string | RegExp = /^Connect /) {
  const button = page.getByRole("button", { name: prompt });
  const connected = page.getByRole("button", { name: "Disconnect" });
  // The server-rendered button shows first and may vanish when the wallet
  // reconnects on its own, so wait until the page settles either way.
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (await connected.isVisible()) return;
    if ((await button.isVisible()) && (await button.isEnabled())) break;
    if (Date.now() > deadline) throw new Error("page never offered a connect button nor connected");
    await page.waitForTimeout(250);
  }
  await button.click();
  await page.getByRole("button", { name: "Browser Wallet" }).click();
  await connected.waitFor();
}

/** Runs one scenario in a fresh page with the test wallet; screenshots on failure. */
export async function scenario(
  context: BrowserContext,
  name: string,
  fn: (page: Page) => Promise<void>,
  account: Address,
) {
  process.stdout.write(`• ${name} … `);
  const page = await context.newPage();
  await injectTestWallet(page, { account, rpcUrl: RPC, chainId: foundry.id });
  try {
    await fn(page);
    console.log("ok");
  } catch (err) {
    const file = join(shots, `FAILED-${name.replace(/\W+/g, "-").slice(0, 40)}.png`);
    await page.screenshot({ path: file }).catch(() => {});
    console.log(`failed (screenshot: ${file})`);
    throw err;
  } finally {
    await page.close();
  }
}

/**
 * A page for a second party (a different phone): its own browser context, so
 * no wallet session or storage is shared with the first party.
 */
export async function pageAs(browser: Browser, account: Address) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await context.newPage();
  page.on("close", () => void context.close());
  await injectTestWallet(page, { account, rpcUrl: RPC, chainId: foundry.id });
  return page;
}
