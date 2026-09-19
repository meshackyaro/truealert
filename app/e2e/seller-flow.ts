// End-to-end seller flows against the local chain, in headless Chrome.
//
// Prereqs (two terminals):  pnpm local-chain   and   pnpm dev
// Run:                      pnpm e2e:seller
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { APP, BUYER, connect, pageAs, scenario, SELLER, setEtnBalance, shots, usdcBalance } from "./helpers";

/** Creates a sale on /sell. Returns the link for Protected sales (pay-now shows a QR). */
async function createSale(page: Page, opts: { protectedMode?: boolean; item: string; price: string }): Promise<string | undefined> {
  await page.goto(`${APP}/sell`);
  await connect(page, "Connect your wallet to sell");
  if (opts.protectedMode) await page.getByRole("radio", { name: /Protected/ }).click();
  await page.getByPlaceholder("e.g. Ankara dress").fill(opts.item);
  await page.getByPlaceholder("15000").fill(opts.price);
  await page.getByText("Buyer pays").waitFor();
  await page.getByRole("button", { name: opts.protectedMode ? "Create payment link" : "Create payment QR" }).click();
  if (opts.protectedMode) {
    await page.getByText("Send this link to your buyer").waitFor();
    const href = await page.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href");
    return decodeURIComponent(href!.split("text=")[1]).split("\n").at(-1)!;
  }
  await page.getByText("Customer scans with their phone camera or wallet").waitFor();
  return undefined;
}

async function buyerPays(buyerPage: Page, url: string, payButton: RegExp, done: (p: Page) => Promise<void>) {
  try {
    await buyerPaysSteps(buyerPage, url, payButton);
    await done(buyerPage);
  } catch (err) {
    await buyerPage.screenshot({ path: join(shots, "FAILED-buyer-side.png") }).catch(() => {});
    throw err;
  }
}

async function buyerPaysSteps(buyerPage: Page, url: string, payButton: RegExp) {
  await buyerPage.goto(url);
  await buyerPage.getByText("Signed by the seller").waitFor();
  await connect(buyerPage, "Connect wallet to pay");
  const allow = buyerPage.getByRole("button", { name: /^Allow / });
  const pay = buyerPage.getByRole("button", { name: payButton });
  await allow.or(pay).first().waitFor();
  if (await allow.isVisible()) await allow.click();
  await pay.click();
}

async function main() {
  await setEtnBalance(BUYER, "0xd3c21bcecceda1000000");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    permissions: ["clipboard-read", "clipboard-write"],
  });

  try {
    await scenario(
      context,
      "Pay now: seller shows QR, buyer pays, seller's screen flips to PAID",
      async (seller) => {
        await createSale(seller, { item: "Phone credit", price: "2500" });
        await seller.getByRole("button", { name: "Copy payment link" }).click();
        const url = await seller.evaluate(() => navigator.clipboard.readText());
        const sellerBefore = await usdcBalance(SELLER);

        const buyer = await pageAs(browser, BUYER);
        await buyerPays(buyer, url, /^Pay ₦2,500/, (p) => p.getByRole("heading", { name: "Paid" }).waitFor());
        await buyer.close();

        await seller.getByText("PAID ✓").waitFor();
        await seller.getByText(/from 0x3C44…93BC/).waitFor();
        await seller.screenshot({ path: join(shots, "seller-paid.png"), fullPage: true });
        if ((await usdcBalance(SELLER)) - sellerBefore !== 1_830_000n) throw new Error("seller should receive 1.83 USDC");
      },
      SELLER,
    );

    await scenario(
      context,
      "Protected: seller shares link, buyer funds, seller sees 'Buyer paid'",
      async (seller) => {
        const url = (await createSale(seller, { protectedMode: true, item: "Ankara dress", price: "15000" }))!;
        const buyer = await pageAs(browser, BUYER);
        await buyerPays(buyer, url, /^Pay safely ₦15,000/, (p) => p.getByText("Paid into escrow").first().waitFor());
        await buyer.close();
        await seller.getByText("Buyer paid ✓").waitFor();
        await seller.screenshot({ path: join(shots, "seller-funded.png"), fullPage: true });
      },
      SELLER,
    );
  } finally {
    await browser.close();
  }
  console.log(`\nAll seller flows passed. Screenshots in ${shots}`);
}

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
