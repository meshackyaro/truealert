# TrueAlert

**No more fake alert.** A mobile-first payment tool on the Electroneum blockchain that lets Nigerian small sellers get paid safely — in person or in the DMs.

- **Pay now** — seller shows a QR, customer pays, the seller's screen confirms the payment from the chain (screenshots prove nothing).
- **Protected** — seller shares an escrow link in WhatsApp/Instagram DMs; funds are released on delivery, with timeouts both ways and optional arbiter disputes.

Sellers price in naira; buyers pay in USDC or ETN.

## Status

Early development — MVP targets the Electroneum testnet (chain ID 5201420).

## Repository layout

- [`contracts/`](contracts/README.md): Solidity smart contracts (Foundry). Setup, tests and deployment are documented there.
- [`app/`](app/README.md): the Next.js web app. Setup, local chain, tests and payment links are documented there.

## Quick start (local, no testnet needed)

```bash
git clone --recurse-submodules https://github.com/meshackyaro/truealert.git
cd truealert
pnpm install:app        # installs app/ dependencies
pnpm local-chain        # terminal 1: local chain + contracts (keep it running)
pnpm dev                # terminal 2: http://localhost:3000
pnpm dev-link           # terminal 3: prints a signed test payment link
```

These commands work from the repo root or from `app/`.

## Deploying (Vercel)

The web app lives in `app/`, so point Vercel at it:

1. **Project Settings → Build & Deployment → Root Directory: `app`.** Without this, Vercel builds from the repo root, installs nothing (the root package has no dependencies) and fails with `next: command not found`.
2. Framework preset: **Next.js** (auto-detected once the root directory is `app`).
3. Add environment variables (Settings → Environment Variables) — `.env` is gitignored, so the deploy has none by default:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CHAIN` | `testnet` (or `mainnet`) |
| `NEXT_PUBLIC_TRUEALERT_ADDRESS` | see [contracts/README.md](contracts/README.md) |
| `NEXT_PUBLIC_USDC_ADDRESS` | see [contracts/README.md](contracts/README.md) |
| `NEXT_PUBLIC_ARBITER_ADDRESS` | the TrueAlert Resolution wallet (optional; without it Protected orders can't be disputed) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | your Reown project ID (optional; without it only browser wallets connect) |

Don't set `RATE_FIXED_NGN_PER_USD` in production — it pins the naira rate and is meant for local development.

If you use WalletConnect, add the deployed domain to the project's allowlist in the Reown dashboard, or wallet connections from it are blocked.

## License

MIT
