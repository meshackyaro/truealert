// Creates a signed payment link as the local test seller, for exercising the
// buyer page before the seller flow exists.
//
//   pnpm dev-link                          # Pay now, 15,000 NGN in USDC
//   pnpm dev-link --protected --etn        # escrow order paid in ETN
//   pnpm dev-link --price 2500 --item "Suya" --buyer 0x...   (lock to buyer)
//   pnpm dev-link --expired                # already-expired invoice
//
// Reads contract addresses from .env.local (written by scripts/local-chain.sh).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  getAddress,
  http,
  keccak256,
  parseUnits,
  toHex,
  zeroAddress,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { trueAlertAbi } from "../src/lib/abi/trueAlert";
import { encodeLink } from "../src/lib/link";
import { hashOrderDetails, Mode, termsDomain, termsTypes, type OrderDetails, type Terms } from "../src/lib/terms";

// Anvil default accounts #1 (seller) and #3 (arbiter). Test-only keys.
const SELLER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ARBITER: Address = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const NGN_PER_USD = "1373.28";
const ETN_USD = 0.00114;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const env = Object.fromEntries(
  readEnvLocal()
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

function readEnvLocal(): string {
  try {
    return readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  } catch {
    console.error("No app/.env.local yet. Start the local chain first with: pnpm local-chain");
    process.exit(1);
  }
}

async function main() {
  const contract = getAddress(env.NEXT_PUBLIC_TRUEALERT_ADDRESS);
  const usdc = getAddress(env.NEXT_PUBLIC_USDC_ADDRESS);
  const rpc = env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
  const client = createPublicClient({ chain: foundry, transport: http(rpc, { retryCount: 0, timeout: 3_000 }) });
  try {
    await client.getChainId();
  } catch {
    throw new Error(`Local chain isn't running at ${rpc}. Start it first with: pnpm local-chain`);
  }
  const seller = privateKeyToAccount(SELLER_KEY);

  const protectedMode = flag("protected");
  const payInEtn = flag("etn");
  const priceNgn = option("price") ?? "15000";
  const item = option("item") ?? (protectedMode ? "Ankara dress" : "Phone credit");
  const buyer = option("buyer") ? getAddress(option("buyer")!) : zeroAddress;

  const usd = Number(priceNgn) / Number(NGN_PER_USD);
  const amount = payInEtn
    ? parseUnits((usd / ETN_USD).toFixed(6), 18)
    : parseUnits(usd.toFixed(6), 6);

  const details: OrderDetails = {
    v: 1,
    item,
    priceNgn,
    sellerName: "Chioma's Closet",
    rate: { ngnPerUsd: NGN_PER_USD, source: "quidax", at: new Date().toISOString() },
  };

  // Anvil's latest block can be minutes old; the next block uses wall-clock time.
  const blockTime = (await client.getBlock()).timestamp;
  const wallClock = BigInt(Math.floor(Date.now() / 1000));
  const now = blockTime > wallClock ? blockTime : wallClock;
  const expiry = flag("expired") ? now - 1n : now + (protectedMode ? 48n * 3600n : 15n * 60n);

  const terms: Terms = {
    id: keccak256(toHex(`${Date.now()}-${Math.random()}`)),
    mode: protectedMode ? Mode.Protected : Mode.PayNow,
    seller: seller.address,
    token: payInEtn ? zeroAddress : usdc,
    amount,
    expiry,
    buyer,
    shipWindow: protectedMode ? 24 * 3600 : 0,
    confirmWindow: protectedMode ? 24 * 3600 : 0,
    arbiter: protectedMode ? ARBITER : zeroAddress,
    ref: hashOrderDetails(details),
  };

  const domain = termsDomain(foundry.id, contract);
  const signature = await seller.signTypedData({ domain, types: termsTypes, primaryType: "Terms", message: terms });

  // Cross-check our TypeScript EIP-712 against the contract's own hashing.
  const [digest, valid] = await Promise.all([
    client.readContract({ address: contract, abi: trueAlertAbi, functionName: "hashTerms", args: [terms] }),
    client.readContract({
      address: contract,
      abi: trueAlertAbi,
      functionName: "isValidSellerSignature",
      args: [terms, signature],
    }),
  ]);
  if (!valid) throw new Error(`Contract rejected the signature (digest ${digest})`);

  const encoded = encodeLink({ chainId: foundry.id, contract, terms, signature, details });
  const base = option("base") ?? "http://localhost:3000";
  console.log(`${protectedMode ? "Protected" : "Pay now"} · ${item} · ₦${priceNgn} · ${payInEtn ? "ETN" : "USDC"}`);
  console.log(`Signature verified on-chain ✓ (digest ${digest})`);
  console.log(`${base}/pay?d=${encoded}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
