// End-to-end buyer flow against the local chain, in headless Chrome.
//
// Prereqs (two terminals):  pnpm local-chain   and   pnpm dev
// Run:                      pnpm e2e
//
// Screenshots go to e2e/screenshots/ (gitignored).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { createPublicClient, createWalletClient, erc20Abi, http, type Address, type Hex } from "viem";
import { foundry } from "viem/chains";
import { trueAlertAbi } from "../src/lib/abi/trueAlert";
import { decodeLink } from "../src/lib/link";
import { injectTestWallet } from "./testWallet";

const RPC = "http://127.0.0.1:8545";
const BUYER: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const SELLER: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const shots = join(__dirname, "screenshots");
mkdirSync(shots, { recursive: true });

const client = createPublicClient({ chain: foundry, transport: http(RPC) });
// Anvil accounts are unlocked, so the node signs for the seller.
const sellerWallet = createWalletClient({ account: SELLER, chain: foundry, transport: http(RPC) });

function orderId(url: string): Hex {
  const result = decodeLink(new URL(url).searchParams.get("d")!);
  if (!result.ok) throw new Error(result.error);
  return result.payload.terms.id;
}

async function sellerDoes(contract: Address, functionName: "markShipped" | "claim" | "cancel", id: Hex) {
  const hash = await sellerWallet.writeContract({ address: contract, abi: trueAlertAbi, functionName, args: [id] });
  await client.waitForTransactionReceipt({ hash });
}

/** Fast-forward the chain clock and mine a block. */
async function warp(seconds: number) {
  await client.request({ method: "evm_increaseTime" as never, params: [seconds] as never });
  await client.request({ method: "evm_mine" as never, params: [] as never });
}

async function fundProtected(page: Page, ...linkArgs: string[]) {
  const { url } = devLink("--protected", ...linkArgs);
  await page.goto(url);
  await page.getByText("Signed by the seller").waitFor();
  await connect(page);
  const allow = page.getByRole("button", { name: /^Allow / });
  const pay = page.getByRole("button", { name: /^Pay safely/ });
  await allow.or(pay).first().waitFor();
  if (await allow.isVisible()) await allow.click();
  await pay.click();
  await page.getByText("Paid into escrow").first().waitFor();
  return { url, id: orderId(url) };
}

async function orderStatus(contract: Address, id: Hex) {
  return (await client.readContract({ address: contract, abi: trueAlertAbi, functionName: "getOrder", args: [id] })).status;
}

function devLink(...args: string[]): { url: string } {
  const out = execFileSync("pnpm", ["-s", "dev-link", ...args], { encoding: "utf8" });
  return { url: out.trim().split("\n").at(-1)! };
}

function envAddress(name: string): Address {
  const out = execFileSync("grep", [`^${name}=`, join(__dirname, "..", ".env.local")], { encoding: "utf8" });
  return out.trim().split("=")[1] as Address;
}

async function connect(page: Page) {
  await page.getByRole("button", { name: "Connect wallet to pay" }).click();
  await page.getByRole("button", { name: "Browser Wallet" }).click();
}

/** Runs one scenario in a fresh page with the test wallet; screenshots on failure. */
async function scenario(context: BrowserContext, name: string, fn: (page: Page) => Promise<void>) {
  process.stdout.write(`• ${name} … `);
  const page = await context.newPage();
  await injectTestWallet(page, { account: BUYER, rpcUrl: RPC, chainId: foundry.id });
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

async function main() {
  const usdc = envAddress("NEXT_PUBLIC_USDC_ADDRESS");
  const trueAlert = envAddress("NEXT_PUBLIC_TRUEALERT_ADDRESS");
  const usdcBalance = (owner: Address) =>
    client.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [owner] });

  // Fresh ETN for every run (each ETN order is ~9,600 ETN; anvil starts accounts at 10,000).
  await client.request({
    method: "anvil_setBalance" as never,
    params: [BUYER, "0xd3c21bcecceda1000000"] as never, // 1,000,000 ETN
  });

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });

  try {
    await scenario(context, "Pay now in USDC: approve, pay, seller receives funds", async (page) => {
      const { url } = devLink("--item", "Phone credit", "--price", "2500");
      const sellerBefore = await usdcBalance(SELLER);

      await page.goto(url);
      await page.getByText("Signed by the seller").waitFor();
      await connect(page);
      await page.getByRole("button", { name: /^Allow 1\.82 USDC/ }).click();
      await page.getByRole("button", { name: /^Pay ₦2,500/ }).click();
      await page.getByRole("heading", { name: "Paid" }).waitFor();
      await page.screenshot({ path: join(shots, "paynow-paid.png") });

      const received = (await usdcBalance(SELLER)) - sellerBefore;
      if (received < 1_800_000n || received > 1_830_000n) throw new Error(`seller got ${received}`);
      if ((await usdcBalance(trueAlert)) !== 0n) throw new Error("contract should hold no pay-now funds");

      // Reopening the same link now shows it as paid.
      await page.goto(url);
      await page.getByText("This invoice has been paid").waitFor();
    });

    await scenario(context, "Protected order in ETN: funds locked in escrow", async (page) => {
      const { url } = devLink("--protected", "--etn", "--item", "Ankara dress");
      const escrowBefore = await client.getBalance({ address: trueAlert });

      await page.goto(url);
      await page.getByText("Signed by the seller").waitFor();
      await connect(page);
      await page.getByRole("button", { name: /^Pay safely ₦15,000/ }).click();
      await page.getByText("Paid into escrow · waiting for the seller to ship").waitFor();
      await page.screenshot({ path: join(shots, "protected-funded.png") });

      const locked = (await client.getBalance({ address: trueAlert })) - escrowBefore;
      if (locked <= 0n) throw new Error("escrow should hold the ETN");
    });

    await scenario(context, "Protected: seller ships, buyer confirms (two taps), seller paid", async (page) => {
      const { id } = await fundProtected(page, "--item", "Ankara dress");
      const sellerBefore = await usdcBalance(SELLER);
      await sellerDoes(trueAlert, "markShipped", id);
      await page.getByText("Shipped · confirm when it arrives").waitFor();
      await page.getByRole("button", { name: "I received it ✓" }).click();
      await page.getByRole("button", { name: /^Tap again to release ₦15,000/ }).click();
      await page.getByText("Completed ✓").waitFor();
      await page.screenshot({ path: join(shots, "protected-released.png") });
      if ((await orderStatus(trueAlert, id)) !== 4) throw new Error("order should be Released");
      if ((await usdcBalance(SELLER)) <= sellerBefore) throw new Error("seller should be paid");
    });

    await scenario(context, "Link reserved for another wallet can't be paid", async (page) => {
      const { url } = devLink("--buyer", SELLER);
      await page.goto(url);
      await connect(page);
      await page.getByText("This link is reserved for another wallet").waitFor();
    });
  } finally {
    await browser.close();
  }
  console.log(`\nAll buyer flows passed. Screenshots in ${shots}`);
}

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
