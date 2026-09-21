# TrueAlert

**No more fake alert.** A mobile-first payment tool on the Electroneum blockchain that lets Nigerian small sellers get paid safely, in person or in the DMs.

**Docs:** [Setup guide](docs/SETUP.md) · [Architecture](docs/ARCHITECTURE.md) · [Contracts](contracts/README.md) · [Web app](app/README.md)

## The problem

- **Fake alerts, in person.** Customers show forged "I've sent it" screenshots or SMS alerts. TrueAlert confirms payment on the **seller's own screen**, read from the blockchain, so a screenshot proves nothing.
- **Trust in DM commerce.** WhatsApp and Instagram sales fail both ways: buyers pay and get nothing, sellers ship and never get paid. TrueAlert holds the buyer's money in escrow until delivery.

## How it works

Sellers price in naira; buyers pay in **USDC or ETN** at a live rate locked when the sale is created.

**Pay now (in person)**
1. The seller lists what they're selling, with a quantity and price per item; the total is calculated for them.
2. They sign the sale in their wallet (free, no gas) and show the QR.
3. The customer scans and pays. The seller's screen flips to **PAID ✓**, straight from the chain.

**Protected (in the DMs)**
1. The seller creates a protected link and shares it on WhatsApp.
2. The buyer pays into escrow; the seller sees "Buyer paid ✓" and ships.
3. The buyer confirms delivery and the seller is paid. Timeouts cover both sides: the buyer gets a full refund if the seller doesn't ship in time, and the seller can collect if the buyer goes silent. With a referee configured, the buyer can also raise a dispute.

Payment links are self-contained: they carry the seller-signed terms and the order details, and the buyer page checks the signature against the contract. A link with an edited price or item list shows "Not signed by the seller. Don't pay."

## Features

- Pay-now QR payments and Protected escrow orders
- Multi-item sales with an automatic total, and an item breakdown for the buyer
- Naira pricing from the Quidax USDT/NGN market, with the official rate as fallback
- Live payment confirmation on the seller's screen, and a recent-sales list with status
- Buyer and seller order actions: confirm delivery, extend once, dispute, reclaim, ship, collect, cancel and refund
- Mobile-first UI with dark mode, installable as a web app

## Deployed contracts (Electroneum testnet)

| Contract | Address |
| --- | --- |
| TrueAlert | `0x83A51C54C78a84fAF09d34B92c8475B9F12a5d34` |
| MockUSDC (test USDC, 6 decimals) | `0x3F2f8D53F9A306eF2A1eF819EC8844883c1916a5` |

Chain ID `5201420`, RPC `https://rpc.ankr.com/electroneum_testnet`. Deployment transactions and details are in [contracts/README.md](contracts/README.md). Mainnet is not deployed yet.

## Tech stack

| Layer | Tools |
| --- | --- |
| Contracts | Solidity 0.8.24, Foundry, OpenZeppelin 5.1 (EIP-712, SignatureChecker, SafeERC20, ReentrancyGuard) |
| Web app | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Wallets and chain | wagmi 2, viem 2, RainbowKit 2 (browser wallets and WalletConnect) |
| Backend | Next.js route handlers (naira rate service) |
| Tests | Foundry (unit, fuzz, invariant), Vitest, Playwright end-to-end with an injected test wallet |

Contracts compile for the `paris` EVM target, because Electroneum doesn't support `PUSH0` or later opcodes.

## Security model

- The contract holds only Protected-order funds; pay-now payments go straight from buyer to seller.
- The owner can allowlist tokens, pause new orders and set a fee capped at 2% (currently 0%), but can never move funds, block refunds or resolve disputes.
- Timeouts guarantee funds can't be locked forever, including a full buyer refund if a referee doesn't rule within 14 days.
- The contract isn't upgradeable.

## Repository layout

- [`docs/`](docs/): the [setup guide](docs/SETUP.md) (fresh machine to a working payment, testnet, deployment, troubleshooting) and the [architecture](docs/ARCHITECTURE.md).
- [`contracts/`](contracts/README.md): Solidity contracts, tests and deployment scripts.
- [`app/`](app/README.md): the Next.js web app, local-chain tooling and end-to-end tests.

## Quick start (local, no testnet needed)

The short version is below. For MetaMask setup, test accounts, testnet and troubleshooting, follow the [setup guide](docs/SETUP.md).

```bash
git clone --recurse-submodules https://github.com/meshackyaro/truealert.git
cd truealert
pnpm install:app        # installs app/ dependencies
pnpm local-chain        # terminal 1: local chain + contracts (keep it running)
pnpm dev                # terminal 2: http://localhost:3000
pnpm dev-link           # terminal 3: prints a signed test payment link
```

These commands work from the repo root or from `app/`. The local chain pins the naira rate, so it works offline.

## Tests

```bash
pnpm test               # app unit tests (98) + contract tests (139)
pnpm e2e                # buyer end-to-end flows (needs local-chain + dev running)
pnpm e2e:seller         # seller end-to-end flows
```

The end-to-end suites drive a real browser with a test wallet that sends real transactions to the local chain: 9 buyer scenarios and 7 seller scenarios.

## Deploying (Vercel)

The web app lives in `app/`, so point Vercel at it:

1. **Project Settings → Build & Deployment → Root Directory: `app`.** Without this, Vercel builds from the repo root, installs nothing (the root package has no dependencies) and fails with `next: command not found`.
2. Framework preset: **Next.js** (auto-detected once the root directory is `app`).
3. Add environment variables (Settings → Environment Variables). `.env` is gitignored, so the deploy has none by default:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CHAIN` | `testnet` (or `mainnet`) |
| `NEXT_PUBLIC_TRUEALERT_ADDRESS` | see [Deployed contracts](#deployed-contracts-electroneum-testnet) |
| `NEXT_PUBLIC_USDC_ADDRESS` | see [Deployed contracts](#deployed-contracts-electroneum-testnet) |
| `NEXT_PUBLIC_ARBITER_ADDRESS` | the referee wallet (optional; without it Protected orders can't be disputed) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | your Reown project ID (optional; without it only browser wallets connect) |

Don't set `RATE_FIXED_NGN_PER_USD` in production. It pins the naira rate and is meant for local development.

If you use WalletConnect, add the deployed domain to the project's allowlist in the Reown dashboard, or wallet connections from it are blocked.

## Status and roadmap

**Done:** contracts deployed on testnet, buyer payment page, seller flow, multi-item sales, live rates, responsive UI with dark mode.

**Next:**
- Short links with WhatsApp preview cards (also makes the pay-now QR much easier to scan)
- Buyer delivery details, and a seller dashboard that works across devices
- Contract source verification on the testnet explorer (waiting on the explorer, which is currently down)
- Mainnet deployment, after a wallet-compatibility check and an independent contract review

## License

MIT
