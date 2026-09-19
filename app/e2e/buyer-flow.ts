// End-to-end buyer flow against the local chain, in headless Chrome.
//
// Prereqs (two terminals):  pnpm local-chain   and   pnpm dev
// Run:                      pnpm e2e
//
// Screenshots go to e2e/screenshots/ (gitignored).
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { trueAlertAbi } from "../src/lib/abi/trueAlert";
import {
  BUYER,
  client,
  connect,
  orderId,
  orderStatus,
  scenario,
  SELLER,
  sellerDoes,
  setEtnBalance,
  shots,
  trueAlert,
  usdcBalance,
  warp,
} from "./helpers";

const PAY_PROMPT = "Connect wallet to pay";
/** dev-link's ₦15,000 at ₦1,373.28/$ in USDC units (not rounded like the seller UI). */
const ORDER_USDC = 10_922_754n;

function devLink(...args: string[]): string {
  const out = execFileSync("pnpm", ["-s", "dev-link", ...args], { encoding: "utf8" });
  return out.trim().split("\n").at(-1)!;
}

async function fundProtected(page: Page, ...linkArgs: string[]) {
  const url = devLink("--protected", ...linkArgs);
  await page.goto(url);
  await page.getByText("Signed by the seller").waitFor();
  await connect(page, PAY_PROMPT);
  const allow = page.getByRole("button", { name: /^Allow / });
  const pay = page.getByRole("button", { name: /^Pay safely/ });
  await allow.or(pay).first().waitFor();
  if (await allow.isVisible()) await allow.click();
  await pay.click();
  await page.getByText("Paid into escrow").first().waitFor();
  return { url, id: orderId(url) };
}

async function disputeFromPage(page: Page) {
  await page.getByRole("button", { name: "Report a problem" }).click();
  await page.getByRole("button", { name: "Tap again to send this to TrueAlert Resolution" }).click();
  await page.getByText("Under review", { exact: true }).first().waitFor();
}

async function buyerScenarios(context: BrowserContext, freshBuyer: Address) {
  const run = (name: string, fn: (page: Page) => Promise<void>, account: Address = BUYER) =>
    scenario(context, name, fn, account);

  await run("Pay now in USDC: approve, pay, seller receives funds", async (page) => {
    const url = devLink("--item", "Phone credit", "--price", "2500");
    const sellerBefore = await usdcBalance(SELLER);
    const escrowBefore = await usdcBalance(trueAlert()); // other runs' open orders

    await page.goto(url);
    await page.getByText("Signed by the seller").waitFor();
    await connect(page, PAY_PROMPT);
    await page.getByRole("button", { name: /^Allow 1\.82 USDC/ }).click();
    await page.getByRole("button", { name: /^Pay ₦2,500/ }).click();
    await page.getByRole("heading", { name: "Paid" }).waitFor();
    await page.screenshot({ path: join(shots, "paynow-paid.png") });

    const received = (await usdcBalance(SELLER)) - sellerBefore;
    if (received < 1_800_000n || received > 1_830_000n) throw new Error(`seller got ${received}`);
    if ((await usdcBalance(trueAlert())) !== escrowBefore) throw new Error("pay-now must not leave funds in the contract");

    // Reopening the same link now shows it as paid.
    await page.goto(url);
    await page.getByText("This invoice has been paid").waitFor();
  });

  await run("Protected order in ETN: funds locked in escrow", async (page) => {
    const escrowBefore = await client.getBalance({ address: trueAlert() });
    await fundProtected(page, "--etn", "--item", "Ankara dress");
    await page.screenshot({ path: join(shots, "protected-funded.png") });
    if ((await client.getBalance({ address: trueAlert() })) <= escrowBefore) throw new Error("escrow should hold the ETN");
  });

  await run("Protected: seller ships, buyer confirms (two taps), seller paid", async (page) => {
    const { id } = await fundProtected(page, "--item", "Ankara dress");
    const sellerBefore = await usdcBalance(SELLER);
    await sellerDoes("markShipped", id);
    await page.getByText("Shipped · confirm when it arrives").waitFor();
    await page.getByRole("button", { name: "I received it ✓" }).click();
    await page.getByRole("button", { name: /^Tap again to release ₦15,000/ }).click();
    await page.getByText("Completed ✓").waitFor();
    await page.screenshot({ path: join(shots, "protected-released.png") });
    if ((await orderStatus(id)) !== 4) throw new Error("order should be Released");
    if ((await usdcBalance(SELLER)) <= sellerBefore) throw new Error("seller should be paid");
  });

  await run("Protected: seller never ships, buyer reclaims full refund", async (page) => {
    const { id } = await fundProtected(page, "--item", "Sneakers");
    const buyerBefore = await usdcBalance(BUYER);
    await warp(24 * 3600 + 5);
    await page.getByText("The seller didn't ship in time").waitFor();
    await page.getByRole("button", { name: "Take my money back" }).click();
    await page.getByRole("button", { name: /^Tap again to refund ₦15,000/ }).click();
    await page.getByText("Refunded ✓").waitFor();
    await page.screenshot({ path: join(shots, "protected-reclaimed.png") });
    if ((await orderStatus(id)) !== 5) throw new Error("order should be Refunded");
    if ((await usdcBalance(BUYER)) - buyerBefore !== ORDER_USDC) throw new Error("buyer should get it all back");
  });

  await run("Protected: buyer extends the confirm deadline once by 48h", async (page) => {
    const { id } = await fundProtected(page, "--item", "Wig");
    await sellerDoes("markShipped", id);
    const read = () => client.readContract({ address: trueAlert(), abi: trueAlertAbi, functionName: "getOrder", args: [id] });
    const before = (await read()).confirmDeadline;
    await page.getByRole("button", { name: "+48 hours" }).click();
    await page.getByText("You've extended this delivery once").waitFor();
    const after = await read();
    if (after.confirmDeadline - before !== 48n * 3600n || !after.extended) {
      throw new Error("confirm deadline should move by exactly 48h");
    }
    if (await page.getByRole("button", { name: "+24 hours" }).count()) throw new Error("no second extension");
  });

  await run("Protected: buyer reports a problem, order frozen for the referee", async (page) => {
    const { id } = await fundProtected(page, "--item", "Phone case");
    await sellerDoes("markShipped", id);
    await disputeFromPage(page);
    await page.screenshot({ path: join(shots, "protected-disputed.png") });
    if ((await orderStatus(id)) !== 3) throw new Error("order should be Disputed");
    await warp(3 * 24 * 3600);
    const claimed = await sellerDoes("claim", id).then(() => true, () => false);
    if (claimed) throw new Error("seller must not be able to claim a disputed order");
    if ((await orderStatus(id)) !== 3) throw new Error("order should still be Disputed");
  });

  await run("Protected: referee misses 14 days, buyer gets a full refund", async (page) => {
    const { id } = await fundProtected(page, "--item", "Handbag");
    const buyerBefore = await usdcBalance(BUYER);
    await sellerDoes("markShipped", id);
    await disputeFromPage(page);
    await warp(14 * 24 * 3600 + 5);
    await page.getByText("The referee didn't decide in time").waitFor();
    await page.getByRole("button", { name: "Get my full refund" }).click();
    await page.getByRole("button", { name: /^Tap again to refund ₦15,000/ }).click();
    await page.getByText("Dispute settled ✓").waitFor();
    if ((await orderStatus(id)) !== 6) throw new Error("order should be Resolved");
    if ((await usdcBalance(BUYER)) - buyerBefore !== ORDER_USDC) throw new Error("buyer should get it all back");
  });

  await run(
    "New buyer with no USDC mints test USDC, then pays",
    async (page) => {
      await page.goto(devLink("--item", "Airtime", "--price", "1000"));
      await connect(page, PAY_PROMPT);
      await page.getByText("(not enough for this payment)").waitFor();
      await page.getByRole("button", { name: "Get free test USDC" }).click();
      await page.getByRole("button", { name: /^Allow / }).click();
      await page.getByRole("button", { name: /^Pay ₦1,000/ }).click();
      await page.getByRole("heading", { name: "Paid" }).waitFor();
    },
    freshBuyer,
  );

  await run("Link reserved for another wallet can't be paid", async (page) => {
    await page.goto(devLink("--buyer", SELLER));
    await connect(page, PAY_PROMPT);
    await page.getByText("This link is reserved for another wallet").waitFor();
  });
}

async function main() {
  // Fresh ETN for every run (each ETN order is ~9,600 ETN; anvil starts accounts at 10,000).
  await setEtnBalance(BUYER, "0xd3c21bcecceda1000000"); // 1,000,000 ETN
  // A brand-new buyer each run (no USDC yet), impersonated so anvil signs for it.
  const freshBuyer = privateKeyToAccount(generatePrivateKey()).address;
  await client.request({ method: "anvil_impersonateAccount" as never, params: [freshBuyer] as never });
  await setEtnBalance(freshBuyer, "0x56bc75e2d63100000"); // 100 ETN for gas

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
  try {
    await buyerScenarios(context, freshBuyer);
  } finally {
    await browser.close();
  }
  console.log(`\nAll buyer flows passed. Screenshots in ${shots}`);
}

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
