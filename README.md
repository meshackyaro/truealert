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
cd truealert/app && pnpm install
pnpm local-chain        # terminal 1: local chain + contracts
pnpm dev                # terminal 2: http://localhost:3000
pnpm dev-link           # prints a signed test payment link
```

## License

MIT
