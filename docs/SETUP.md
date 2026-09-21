# Setup guide

This guide takes you from a fresh machine to making a real payment with TrueAlert: first on a local chain (no wallet funding, works offline), then on the Electroneum testnet, then deployed.

Every command here was run end to end from a fresh clone. For how the system works, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Get the code](#2-get-the-code)
3. [Install and check](#3-install-and-check)
4. [Run it locally](#4-run-it-locally)
5. [Make a payment in your browser](#5-make-a-payment-in-your-browser)
6. [Run the tests](#6-run-the-tests)
7. [Use the Electroneum testnet](#7-use-the-electroneum-testnet)
8. [Deploy your own contracts](#8-deploy-your-own-contracts)
9. [Deploy the web app](#9-deploy-the-web-app)
10. [Configuration reference](#10-configuration-reference)
11. [Troubleshooting](#11-troubleshooting)

## 1. Prerequisites

| Tool | Version | Install | Used for |
| --- | --- | --- | --- |
| Git | any recent | [git-scm.com](https://git-scm.com) | cloning, submodules |
| Node.js | **20.9 or newer** | [nodejs.org](https://nodejs.org) or `nvm install 20` | the web app |
| pnpm | 9 | `npm install -g pnpm@9` | installing app dependencies |
| Foundry | 1.x | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` | contracts, the local chain (`anvil`), `cast` |
| jq | any | `apt install jq` / `brew install jq` | the local-chain script |
| Google Chrome | any recent | [google.com/chrome](https://www.google.com/chrome/) | end-to-end tests only |
| MetaMask | browser extension | [metamask.io](https://metamask.io) | paying in your browser |

Check you have them:

```bash
node -v        # v20.9.0 or newer
pnpm -v        # 9.x
forge --version
jq --version
```

## 2. Get the code

```bash
git clone --recurse-submodules https://github.com/meshackyaro/truealert.git
cd truealert
```

The clone takes a minute or two, because the contract dependencies (OpenZeppelin, forge-std) come in as git submodules.

If you already cloned without `--recurse-submodules`, fetch them now:

```bash
git submodule update --init --recursive
```

## 3. Install and check

```bash
pnpm install:app        # installs the web app's dependencies (about 15 seconds)
pnpm test               # app unit tests, then contract tests
```

You should see `Tests 98 passed` for the app and `139 tests passed` for the contracts. If both pass, your toolchain is set up correctly.

All `pnpm` commands in this guide work from the repo root; they forward to `app/`.

## 4. Run it locally

The local chain is `anvil`, configured like Electroneum (London EVM, 1-second blocks). The script deploys the contracts, funds a test buyer with test USDC, and writes the app's `app/.env.local`, so there's nothing to configure.

**Terminal 1: the chain.** Keep it running.

```bash
pnpm local-chain
```

Expected output:

```
Local chain ready (London EVM) at http://127.0.0.1:8545
  TrueAlert  0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
  MockUSDC   0x5FbDB2315678afecb367f032d93F642f64180aa3
  Wrote app/.env.local — now run: pnpm dev   and   pnpm dev-link
```

**Terminal 2: the app.**

```bash
pnpm dev
```

Open http://localhost:3000. The header badge should read **Local chain**.

**Terminal 3: a test payment link** (optional). This signs a sale as the test seller and prints a link:

```bash
pnpm dev-link                     # Pay now, ₦15,000 in USDC
pnpm dev-link --protected --etn   # Protected (escrow) order paid in ETN
pnpm dev-link --expired           # an already-expired link
```

Open the printed link: you'll see the invoice with **✓ Signed by the seller**.

The local chain pins the naira rate at ₦1,373.28/$ (`RATE_FIXED_NGN_PER_USD` in `app/.env.local`), so everything works offline and quotes are the same on every run.

Stopping the chain (Ctrl+C in terminal 1) erases its state. The next `pnpm local-chain` starts fresh and rewrites `app/.env.local`; restart `pnpm dev` afterwards so the app picks it up.

## 5. Make a payment in your browser

### Add the local network to MetaMask

MetaMask → network menu → **Add network → Add a network manually**:

| Field | Value |
| --- | --- |
| Network name | TrueAlert Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` (any symbol works; MetaMask may suggest another for chain 31337, which is fine) |

### Import the test accounts

These are anvil's public default keys. **They are for the local chain only. Never send real funds to them.**

| Role | Address | Private key |
| --- | --- | --- |
| Seller | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Buyer | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

MetaMask → account menu → **Add account or hardware wallet → Import account** → paste a private key. The buyer already has test ETN for gas and 5,000 test USDC.

### Walk through a sale

1. As the **seller**, open http://localhost:3000/sell and connect. Add an item and a price. Try **+ Add item** to see the total calculated.
2. Choose **Pay now** and tap **Create payment QR**. Sign in MetaMask; it's free, with no gas.
3. Tap **Copy payment link**. Open it in a **second browser profile** (or a private window) where MetaMask uses the **buyer** account.
4. As the buyer, connect, tap **Allow**, then **Pay**. Approve both in MetaMask.
5. Back on the seller's tab, the screen flips to **PAID ✓** by itself.

For a Protected order, choose **Protected** in step 2 and share the link instead. After the buyer pays, the seller taps **Manage this order → Mark as shipped**, and the buyer taps **I received it ✓** to release the money.

## 6. Run the tests

| Command | What runs | Needs |
| --- | --- | --- |
| `pnpm test` | 98 app unit tests + 139 contract tests (unit, fuzz, invariant) | nothing running |
| `pnpm e2e` | 9 buyer end-to-end scenarios in headless Chrome | `pnpm local-chain` and `pnpm dev` running |
| `pnpm e2e:seller` | 7 seller end-to-end scenarios | same |

The end-to-end tests inject a small test wallet into the browser that forwards to anvil's unlocked accounts, so every scenario sends real transactions: paying, escrow, shipping, confirming, disputes, refunds, and multi-item sales. Failure screenshots land in `app/e2e/screenshots/`.

If the app runs on another port, point the tests at it:

```bash
E2E_BASE_URL=http://localhost:3002 pnpm e2e
```

Contract tests on their own, with more detail:

```bash
cd contracts
forge test -vv          # includes the invariant coverage report
forge coverage          # TrueAlert.sol: 100% lines and functions, 98% branches
```

## 7. Use the Electroneum testnet

### Add Electroneum testnet to MetaMask

| Field | Value |
| --- | --- |
| Network name | Electroneum Testnet |
| RPC URL | `https://rpc.ankr.com/electroneum_testnet` |
| Chain ID | `5201420` |
| Currency symbol | `ETN` |
| Block explorer | `https://testnet-blockexplorer.electroneum.com` |

The app also offers to add or switch to this network when you connect.

### Get test funds

- **Test ETN** (for gas): the [Electroneum faucet](https://faucet.electroneum.com).
- **Test USDC**: on the buyer page, a buyer who's short gets a **Get free test USDC** button, which mints from `MockUSDC`.

### Point the app at testnet

Create `app/.env` (or edit it) with the deployed testnet contracts:

```bash
NEXT_PUBLIC_CHAIN=testnet
NEXT_PUBLIC_TRUEALERT_ADDRESS=0x83A51C54C78a84fAF09d34B92c8475B9F12a5d34
NEXT_PUBLIC_USDC_ADDRESS=0x3F2f8D53F9A306eF2A1eF819EC8844883c1916a5
```

Then:

1. **Remove or rename `app/.env.local`.** It overrides `app/.env` and points at the local chain.
2. **Restart `pnpm dev`.** Next.js reads these values at startup, so edits have no effect until you restart.
3. The header badge should now read **Testnet**.

To go back to local, run `pnpm local-chain` again (it rewrites `app/.env.local`) and restart `pnpm dev`.

### Smoke-test the live contracts

This sends one real payment on testnet: it mints 1 test USDC, signs an invoice, approves and pays. It costs a fraction of a cent in test ETN.

```bash
PRIVATE_KEY=0x<a testnet-only key with some test ETN> pnpm testnet-smoke
```

## 8. Deploy your own contracts

Optional: the shared testnet deployment above works for trying the app.

```bash
cd contracts
cp .env.example .env
# edit .env: PRIVATE_KEY=0x...   (a dedicated testnet wallet, 0x-prefixed)
source .env
forge script script/Deploy.s.sol --rpc-url electroneum_testnet --broadcast --legacy
```

The script deploys `MockUSDC` (unless `USDC` is set), deploys `TrueAlert`, allowlists USDC, and prints both addresses. Put them in `app/.env`.

Two Electroneum specifics, both already handled in the repo:

- Contracts compile for the `paris` EVM target (`foundry.toml`), because Electroneum rejects the `PUSH0` opcode used by newer targets.
- Deploy with `--legacy`. Foundry's EIP-1559 fee estimate on Electroneum comes out far below the ~1 gwei the network charges.

## 9. Deploy the web app

On Vercel:

1. Import the GitHub repo.
2. **Settings → Build & Deployment → Root Directory: `app`.** The web app lives in `app/`. Without this setting the build fails with `next: command not found`.
3. **Settings → Environment Variables**: add the variables from [Configuration reference](#10-configuration-reference). `NEXT_PUBLIC_CHAIN`, `NEXT_PUBLIC_TRUEALERT_ADDRESS` and `NEXT_PUBLIC_USDC_ADDRESS` are required.
4. Deploy. After changing any variable, redeploy: they're baked in at build time.
5. If you set a WalletConnect project ID, add your Vercel domain to the project's allowlist in the [Reown dashboard](https://cloud.reown.com).

## 10. Configuration reference

### Web app (`app/.env`, `app/.env.local`, or Vercel)

`app/.env.local` overrides `app/.env`. Both are gitignored; `app/.env.example` lists every variable.

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_CHAIN` | yes | `testnet` | `local`, `testnet` or `mainnet` |
| `NEXT_PUBLIC_TRUEALERT_ADDRESS` | yes | `0x83A5…5d34` | the TrueAlert contract |
| `NEXT_PUBLIC_USDC_ADDRESS` | yes | `0x3F2f…16a5` | USDC (MockUSDC on testnet) |
| `NEXT_PUBLIC_RPC_URL` | no | | override the chain's default RPC |
| `NEXT_PUBLIC_ARBITER_ADDRESS` | no | | referee wallet offered to sellers. Without it, Protected orders can't be disputed |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | no | | Reown project ID. Without it, only browser-injected wallets connect (including wallet in-app browsers) |
| `RATE_FIXED_NGN_PER_USD` | no | `1373.28` | **development only**: pin the naira rate |
| `RATE_FIXED_ETN_USD` | no | `0.00114` | **development only**: pin the ETN price |

`NEXT_PUBLIC_*` values are compiled into the browser code, so restart `pnpm dev` (or redeploy) after changing them.

### Contracts (`contracts/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `PRIVATE_KEY` | yes | deployer key, `0x`-prefixed |
| `OWNER` | no | hand ownership to another address (it must then call `acceptOwnership()`) |
| `USDC` | no | use an existing USDC instead of deploying MockUSDC |

### Networks

| Network | Chain ID | RPC | Explorer |
| --- | --- | --- | --- |
| Local (anvil) | 31337 | `http://127.0.0.1:8545` | none |
| Electroneum testnet | 5201420 | `https://rpc.ankr.com/electroneum_testnet` | [testnet-blockexplorer.electroneum.com](https://testnet-blockexplorer.electroneum.com) |
| Electroneum mainnet | 52014 | `https://rpc.electroneum.com` | [blockexplorer.electroneum.com](https://blockexplorer.electroneum.com) |

## 11. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Vercel: `sh: next: command not found` | Vercel built from the repo root | Set **Root Directory** to `app` |
| Header shows the wrong network (e.g. "Local chain" instead of "Testnet") | The dev server started with old env values; `app/.env.local` overrides `app/.env` | Remove or rename `app/.env.local`, then restart `pnpm dev` |
| Every payment link says "This link is for a different network" | The app's chain or contract address doesn't match the link's | Check `NEXT_PUBLIC_CHAIN` and `NEXT_PUBLIC_TRUEALERT_ADDRESS`, then restart or redeploy |
| `Local chain isn't running at http://127.0.0.1:8545` | `pnpm dev-link` needs the chain | Start `pnpm local-chain` first |
| `No app/.env.local yet` | The local chain hasn't been started in this clone | Run `pnpm local-chain` |
| Links show "expired" right after creating them (local) | Stale clock on an old local chain | Restart `pnpm local-chain`; it mines every second |
| "Exchange rate unavailable" and the Create button stays grey | The live rate APIs (Quidax, CoinGecko) are unreachable | Wait and retry; for local work set `RATE_FIXED_NGN_PER_USD` in `app/.env.local` |
| `Another next dev server is already running` | Next.js allows one dev server per project folder | Stop the other one, or use it |
| `address already in use` on port 8545 | Another anvil is running | Stop it, e.g. `pkill anvil` |
| "Connect" shows **Loading wallets…** for a few seconds | WalletConnect is starting up | Wait; this is normal on slow connections |
| WalletConnect connections fail on the deployed site | The domain isn't in the Reown allowlist | Add it in the Reown dashboard |
| Deploy fails with `invalid opcode: PUSH0` | Contracts compiled for a newer EVM | Keep `evm_version = "paris"` in `contracts/foundry.toml` |
| Deploy fee estimate is far below ~1 gwei | Foundry's EIP-1559 estimate is off on Electroneum | Add `--legacy` to `forge script` |
| `vm.envUint: failed parsing $PRIVATE_KEY … missing hex prefix ("0x")` | `PRIVATE_KEY` lacks the `0x` prefix | Add `0x` to the key in `contracts/.env` |
| Explorer links return nothing | The Electroneum testnet explorer is intermittently down | Transactions still settle; check them with `cast tx <hash> --rpc-url electroneum_testnet` |
| E2E tests fail to launch a browser | Google Chrome isn't installed | Install Chrome; the tests use its `chrome` channel |
