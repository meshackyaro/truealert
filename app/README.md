# TrueAlert app

Next.js 16 web app for TrueAlert. It includes the buyer payment page (`/pay`), and later the seller tools and API routes.

## Prerequisites

- Node.js 20.9+ and [pnpm](https://pnpm.io/)
- [Foundry](https://book.getfoundry.sh/) (`forge`, `anvil`, `cast`) for the local chain
- `jq` (used by the local-chain script)
- Google Chrome (only for the end-to-end tests)

```bash
cd app
pnpm install
```

## Configuration

Copy `.env.example` to `.env.local`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CHAIN` | `local`, `testnet` or `mainnet` |
| `NEXT_PUBLIC_RPC_URL` | Optional RPC override |
| `NEXT_PUBLIC_TRUEALERT_ADDRESS` | Deployed `TrueAlert` contract |
| `NEXT_PUBLIC_USDC_ADDRESS` | USDC (MockUSDC on testnet) |
| `NEXT_PUBLIC_ARBITER_ADDRESS` | The "TrueAlert Resolution" arbiter wallet shown as recognised to buyers |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional. Enables MetaMask/Trust/WalletConnect. Without it only browser-injected wallets work, which includes wallet in-app browsers. |

## Run locally (no testnet needed)

Two terminals:

```bash
pnpm local-chain   # anvil (London EVM, like Electroneum) + contracts + .env.local
pnpm dev           # http://localhost:3000
```

Create a signed test payment link as the local test seller:

```bash
pnpm dev-link                      # Pay now, ₦15,000 in USDC
pnpm dev-link --protected --etn    # Protected (escrow) order in ETN
pnpm dev-link --buyer 0x…          # link reserved for one wallet
pnpm dev-link --expired            # already-expired link
```

To pay in a browser, import anvil's test buyer key into MetaMask (account #2, `0x5de4111a…`, found in `anvil --help`) and add the network `http://127.0.0.1:8545` with chain ID 31337. Never use anvil keys anywhere real.

## Tests

```bash
pnpm test    # unit tests (vitest)
pnpm e2e     # end-to-end buyer flows in headless Chrome; needs local-chain + dev running
```

The end-to-end suite injects a minimal test wallet that forwards to anvil's unlocked accounts, so every scenario sends real transactions. It covers:

- pay now
- funding escrow
- confirming delivery
- reclaiming
- extending
- disputing
- the referee-timeout refund
- minting test USDC
- links reserved for another wallet

## How payment links work

A link (`/pay?d=…`) carries the seller-signed terms (EIP-712), the signature, and the order details (item, naira price, locked rate). The page recomputes the details hash and asks the contract whether the seller's signature is valid. A link with edited details fails that check, and the page leads with a "don't pay" warning. Links work without any backend.

## Structure

```
src/app/pay/          buyer payment page
src/components/pay/   invoice card, payment action, order panel and actions
src/config/           chains (incl. Electroneum testnet), env, tokens, wagmi
src/hooks/            invoice state, balances, contract transactions, clocks
src/lib/              link encoding, EIP-712 terms, invoice/order logic, errors, formatting
src/lib/abi/          generated from contracts/ (pnpm sync-abi)
scripts/              local chain, test links, ABI sync
e2e/                  Playwright end-to-end tests
```

## Notes

- **Electroneum testnet chain:** we define it in `src/config/chains.ts` because viem's built-in entry points at a dead RPC.
- **`@x402/*` stub:** wagmi's Base Account connector pulls in `@coinbase/cdp-sdk`, whose optional `@x402/*` peers aren't installed. `next.config.ts` aliases them to a stub that throws if ever called. TrueAlert uses neither.
- **Token display:** only tokens in `src/config/tokens.ts` are ever shown. On-chain token names are never rendered, because testnet has spoofed ones.
