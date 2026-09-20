// End-to-end seller flows against the local chain, in headless Chrome.
//
// Prereqs (two terminals):  pnpm local-chain   and   pnpm dev
// Run:                      pnpm e2e:seller
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import {
  APP,
  BUYER,
  connect,
  linkTerms,
  orderId,
  order,
  orderStatus,
  pageAs,
  scenario,
  SELLER,
  sellerDoes,
  setEtnBalance,
  shots,
  usdcBalance,
  warp,
} from "./helpers";

/** Creates a sale on /sell. Returns the link for Protected sales (pay-now shows a QR). */
async function createSale(page: Page, opts: { protectedMode?: boolean; item: string; price: string }): Promise<string | undefined> {
  await page.goto(`${APP}/sell`);
  await connect(page, "Connect your wallet to sell");
  if (opts.protectedMode) await page.getByRole("radio", { name: /Protected/ }).click();
  await page.getByPlaceholder("e.g. Ankara dress").fill(opts.item);
  await page.getByPlaceholder("15000").fill(opts.price);
  await page.getByText(/Buyer pays \d/).waitFor();
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
        const amount = linkTerms(url).amount; // quoted at the live rate
        const sellerBefore = await usdcBalance(SELLER);

        const buyer = await pageAs(browser, BUYER);
        await buyerPays(buyer, url, /^Pay ₦2,500/, (p) => p.getByRole("heading", { name: "Paid" }).waitFor());
        await buyer.close();

        await seller.getByText("PAID ✓").waitFor();
        await seller.getByText(/from 0x3C44…93BC/).waitFor();
        await seller.screenshot({ path: join(shots, "seller-paid.png"), fullPage: true });
        if ((await usdcBalance(SELLER)) - sellerBefore !== amount) throw new Error("seller should receive the invoice amount");
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

    await scenario(
      context,
      "Protected: seller opens the order and marks it shipped",
      async (seller) => {
        const url = (await createSale(seller, { protectedMode: true, item: "Sneakers", price: "15000" }))!;
        const buyer = await pageAs(browser, BUYER);
        await buyerPays(buyer, url, /^Pay safely ₦15,000/, (p) => p.getByText("Paid into escrow").first().waitFor());
        await seller.getByRole("link", { name: "Manage this order" }).click();
        await seller.getByText("Buyer paid ✓ · ship the order").waitFor();
        await seller.getByRole("button", { name: "Mark as shipped" }).click();
        await seller.getByRole("button", { name: "Tap again to confirm you've sent it" }).click();
        await seller.getByText("Shipped · waiting for the buyer").waitFor();
        await seller.screenshot({ path: join(shots, "seller-shipped.png"), fullPage: true });
        if ((await orderStatus(orderId(url))) !== 2) throw new Error("order should be Shipped");
        // The buyer's page now asks them to confirm.
        await buyer.reload();
        await buyer.getByText("Shipped · confirm when it arrives").waitFor();
        await buyer.close();
      },
      SELLER,
    );

    await scenario(
      context,
      "Protected: buyer goes silent, seller collects after the confirm deadline",
      async (seller) => {
        const url = (await createSale(seller, { protectedMode: true, item: "Wig", price: "15000" }))!;
        const buyer = await pageAs(browser, BUYER);
        await buyerPays(buyer, url, /^Pay safely ₦15,000/, (p) => p.getByText("Paid into escrow").first().waitFor());
        await buyer.close();
        const id = orderId(url);
        const amount = (await order(id)).amount; // quoted at the live rate, so read it
        await sellerDoes("markShipped", id);
        await warp(24 * 3600 + 5);
        const before = await usdcBalance(SELLER);
        await seller.goto(url);
        await seller.getByText("Ready to collect").waitFor();
        await seller.getByRole("button", { name: "Collect ₦15,000" }).click();
        await seller.getByRole("button", { name: "Tap again to collect ₦15,000" }).click();
        await seller.getByText("Completed ✓").waitFor();
        if ((await orderStatus(id)) !== 4) throw new Error("order should be Released");
        if ((await usdcBalance(SELLER)) - before !== amount) throw new Error("seller should collect the order amount");
      },
      SELLER,
    );

    await scenario(
      context,
      "Protected: seller cancels and the buyer is refunded in full",
      async (seller) => {
        const url = (await createSale(seller, { protectedMode: true, item: "Handbag", price: "15000" }))!;
        const buyer = await pageAs(browser, BUYER);
        await buyerPays(buyer, url, /^Pay safely ₦15,000/, (p) => p.getByText("Paid into escrow").first().waitFor());
        await buyer.close();
        const amount = (await order(orderId(url))).amount;
        const buyerBefore = await usdcBalance(BUYER);
        await seller.getByRole("link", { name: "Manage this order" }).click();
        await seller.getByText("Can't fulfil this order?").click();
        await seller.getByRole("button", { name: "Cancel and refund the buyer" }).click();
        await seller.getByRole("button", { name: "Tap again to refund ₦15,000 to the buyer" }).click();
        await seller.getByRole("heading", { name: "Refunded" }).waitFor();
        if ((await orderStatus(orderId(url))) !== 5) throw new Error("order should be Refunded");
        if ((await usdcBalance(BUYER)) - buyerBefore !== amount) throw new Error("buyer should get the full amount back");
      },
      SELLER,
    );

    await scenario(
      context,
      "Recent sales list tracks status and reopens a sale",
      async (seller) => {
        await createSale(seller, { item: "Recharge card", price: "500" });
        await seller.getByRole("button", { name: "Copy payment link" }).click();
        const url = await seller.evaluate(() => navigator.clipboard.readText());
        await seller.getByRole("button", { name: "New sale", exact: true }).click();

        const row = seller.getByRole("button", { name: /Recharge card/ });
        await row.getByText("Waiting for payment").waitFor();

        const buyer = await pageAs(browser, BUYER);
        await buyerPays(buyer, url, /^Pay ₦500/, (p) => p.getByRole("heading", { name: "Paid" }).waitFor());
        await buyer.close();

        await row.getByText("Paid ✓").waitFor({ timeout: 20_000 });
        await seller.screenshot({ path: join(shots, "seller-recent-sales.png"), fullPage: true });
        await row.click();
        await seller.getByText("PAID ✓").waitFor(); // reopened, with its live status
        // The back arrow returns to the new-sale form.
        await seller.getByRole("button", { name: "Back to new sale" }).click();
        await seller.getByText("What are you selling?").waitFor();
      },
      SELLER,
    );

    await scenario(
      context,
      "Multi-item sale totals up and shows the buyer a breakdown",
      async (seller) => {
        await seller.goto(`${APP}/sell`);
        await connect(seller, "Connect your wallet to sell");
        await seller.getByRole("radio", { name: /Protected/ }).click();
        await seller.getByPlaceholder("e.g. Ankara dress").fill("Ankara dress");
        await seller.getByLabel("Quantity for item 1").fill("2");
        await seller.getByLabel("Price for item 1").fill("7500");
        await seller.getByRole("button", { name: "+ Add item" }).click();
        await seller.getByPlaceholder("Another item").fill("Gele headwrap");
        await seller.getByLabel("Price for item 2").fill("2500.50");
        await seller.getByText("Total ₦17,500.50").waitFor();
        await seller.getByRole("button", { name: "Create payment link" }).click();
        await seller.getByText("Send this link to your buyer").waitFor();
        const href = await seller.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href");
        const url = decodeURIComponent(href!.split("text=")[1]).split("\n").at(-1)!;

        const buyer = await pageAs(browser, BUYER);
        await buyer.goto(url);
        await buyer.getByText("Signed by the seller").waitFor();
        await buyer.getByText("Ankara dress +1 more").waitFor(); // summary
        await buyer.getByText("2 × Ankara dress").waitFor(); // breakdown
        await buyer.getByText("₦15,000").waitFor(); // line total
        await buyer.getByText("₦2,500.50").waitFor();
        await buyer.screenshot({ path: join(shots, "buyer-breakdown.png"), fullPage: true });
        if (linkTerms(url).amount !== 12_750_000n) {
          // ₦17,500.50 at the live rate; just check it's a sane USDC amount
          const amount = linkTerms(url).amount;
          if (amount < 11_000_000n || amount > 15_000_000n) throw new Error(`unexpected amount ${amount}`);
        }
        await buyer.close();
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
