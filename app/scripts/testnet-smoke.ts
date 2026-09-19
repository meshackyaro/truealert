// Smoke test against a live deployment: one wallet acts as seller and buyer,
// mints 1 test USDC, signs a pay-now invoice, approves and pays it.
//
//   PRIVATE_KEY=0x... pnpm testnet-smoke        (reads addresses from .env)
//
// Costs a fraction of a cent in test ETN. Testnet only (uses MockUSDC.mint).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  getAddress,
  http,
  keccak256,
  parseEventLogs,
  toHex,
  zeroAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { electroneumTestnet } from "../src/config/chains";
import { mockUsdcAbi } from "../src/lib/abi/mockUsdc";
import { trueAlertAbi } from "../src/lib/abi/trueAlert";
import { hashOrderDetails, Mode, termsDomain, termsTypes, type OrderDetails, type Terms } from "../src/lib/terms";

const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

async function main() {
  const raw = process.env.PRIVATE_KEY;
  if (!raw) throw new Error("Set PRIVATE_KEY (a testnet-only wallet with a little test ETN).");
  const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
  const contract = getAddress(env.NEXT_PUBLIC_TRUEALERT_ADDRESS);
  const usdc = getAddress(env.NEXT_PUBLIC_USDC_ADDRESS);
  const transport = http(env.NEXT_PUBLIC_RPC_URL || undefined);
  const client = createPublicClient({ chain: electroneumTestnet, transport });
  const wallet = createWalletClient({ account, chain: electroneumTestnet, transport });
  const send = async (hash: Promise<Hex>, label: string) => {
    const receipt = await client.waitForTransactionReceipt({ hash: await hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${receipt.transactionHash}`);
    console.log(`✓ ${label.padEnd(10)} ${receipt.transactionHash}`);
    return receipt;
  };

  console.log(`Wallet ${account.address} on ${electroneumTestnet.name}`);
  const amount = 1_000_000n; // 1 USDC

  await send(
    wallet.writeContract({ address: usdc, abi: mockUsdcAbi, functionName: "mint", args: [account.address, amount] }),
    "mint",
  );

  const details: OrderDetails = { v: 1, item: "Testnet smoke test", priceNgn: "1373" };
  const block = await client.getBlock();
  const terms: Terms = {
    id: keccak256(toHex(`smoke-${Date.now()}`)),
    mode: Mode.PayNow,
    seller: account.address,
    token: usdc,
    amount,
    expiry: block.timestamp + 900n,
    buyer: zeroAddress,
    shipWindow: 0,
    confirmWindow: 0,
    arbiter: zeroAddress,
    ref: hashOrderDetails(details),
  };
  const signature = await account.signTypedData({
    domain: termsDomain(electroneumTestnet.id, contract),
    types: termsTypes,
    primaryType: "Terms",
    message: terms,
  });
  const valid = await client.readContract({
    address: contract,
    abi: trueAlertAbi,
    functionName: "isValidSellerSignature",
    args: [terms, signature],
  });
  if (!valid) throw new Error("Contract rejected the seller signature");
  console.log("✓ signature  verified by the contract");

  await send(
    wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: "approve", args: [contract, amount] }),
    "approve",
  );
  const receipt = await send(
    wallet.writeContract({ address: contract, abi: trueAlertAbi, functionName: "payInvoice", args: [terms, signature] }),
    "payInvoice",
  );

  const [paid] = parseEventLogs({ abi: trueAlertAbi, eventName: "InvoicePaid", logs: receipt.logs });
  const used = await client.readContract({ address: contract, abi: trueAlertAbi, functionName: "used", args: [terms.id] });
  if (!paid || paid.args.id !== terms.id || !used) throw new Error("InvoicePaid event or used() mismatch");
  console.log(`✓ InvoicePaid ${paid.args.amount} units, invoice marked used`);
  console.log("Testnet smoke test passed.");
}

main().catch((err) => {
  console.error(`FAILED: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
