# TrueAlert contracts

Solidity contracts for TrueAlert, built with [Foundry](https://book.getfoundry.sh/).

| Contract | Purpose |
| --- | --- |
| `TrueAlert.sol` | Pay-now invoices and Protected (escrow) orders. Sellers sign terms off-chain (EIP-712); buyers submit them with payment. |
| `MockUSDC.sol` | Testnet-only USDC stand-in (6 decimals, open mint capped at 10,000 per call). |

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge` 1.x)
- Git (dependencies are submodules)

## Setup

```bash
git clone --recurse-submodules https://github.com/meshackyaro/truealert.git
cd truealert/contracts
# already cloned without submodules?  git submodule update --init --recursive
forge build
```

## Test

```bash
forge test            # unit, fuzz and invariant tests
forge test -vv        # with logs (invariant coverage report)
forge coverage        # line coverage
```

## EVM version

Electroneum Smart Chain supports opcodes up to **London**. It does not support `PUSH0` (Shanghai) or `TLOAD`/`MCOPY` (Cancun). `foundry.toml` pins `evm_version = "paris"`. Don't change it: contracts compiled for Shanghai or later fail to deploy with `invalid opcode: PUSH0`.

## Deploy

```bash
cp .env.example .env      # fill in PRIVATE_KEY (a dedicated testnet wallet)
source .env
forge script script/Deploy.s.sol --rpc-url electroneum_testnet --broadcast
```

Get testnet ETN for gas from the [Electroneum faucet](https://faucet.electroneum.com).

The script deploys `MockUSDC` (unless `USDC` is set), deploys `TrueAlert`, and allowlists USDC. If `OWNER` is set, it starts a two-step ownership handover, and that address must call `acceptOwnership()`.

| Network | Chain ID | RPC | Explorer |
| --- | --- | --- | --- |
| Electroneum testnet | 5201420 | `https://rpc.ankr.com/electroneum_testnet` | [testnet-blockexplorer.electroneum.com](https://testnet-blockexplorer.electroneum.com) |
| Electroneum mainnet | 52014 | `https://rpc.electroneum.com` | [blockexplorer.electroneum.com](https://blockexplorer.electroneum.com) |

## Deployed addresses

| Network | TrueAlert | USDC |
| --- | --- | --- |
| Testnet | _pending_ | _pending_ (MockUSDC) |
| Mainnet | not deployed | `0x3187deAd7A2Bd6770F5Fe81495D1B715926AAe6e` (Hyperlane USDC) |

## How TrueAlert works

**Pay now:** `payInvoice(terms, sig)` checks the seller's signature, expiry, single use and token allowlist, then moves the exact amount straight from buyer to seller. The contract never holds pay-now funds, and there's no fee.

**Protected:** `fund(terms, sig)` locks the payment in escrow. From there:

| Function | Caller | When | Result |
| --- | --- | --- | --- |
| `markShipped` | seller | Funded, before ship deadline | starts confirm window |
| `confirmReceived` | buyer | Funded or Shipped | pays seller (less fee) |
| `claim` | seller | Shipped, after confirm deadline | pays seller (less fee) |
| `reclaim` | buyer | Funded, after ship deadline | full refund |
| `cancel` | seller | Funded or Shipped | full refund |
| `extend` | buyer | Shipped, once, ≤ 48h | later confirm deadline |
| `dispute` | buyer | Shipped, before confirm deadline, arbiter set | freezes order for 14 days |
| `resolve` | arbiter | Disputed, within 14 days | splits funds between seller and buyer |
| `resolveTimeout` | anyone | Disputed, after 14 days | full refund to buyer |

Window bounds: ship window 1h–14d, confirm window 12h–14d.

**Admin limits:** the owner can allowlist tokens, pause *new* invoices and orders, and set a fee of at most 2%. The fee is snapshotted per order at funding and charged only on seller payouts. The owner can't move funds or block releases, refunds or rulings, and the contract isn't upgradeable.
