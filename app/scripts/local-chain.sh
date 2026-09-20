#!/usr/bin/env bash
# Starts a local anvil chain that mimics Electroneum (London EVM, no PUSH0),
# deploys TrueAlert + MockUSDC, funds the test buyer with USDC, and writes
# the addresses to app/.env.local. Ctrl+C stops the chain.
#
# Test accounts (anvil defaults — never use these keys anywhere real):
#   #0 deployer/owner  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
#   #1 seller          0x70997970C51812dc3A010C7d01b50e0d17dc79C8
#   #2 buyer           0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
#   #3 arbiter         0x90F79bf6EB2c4f870365E785982E1f101E93b906
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$APP_DIR/../contracts"
RPC=http://127.0.0.1:8545
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
BUYER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

# --block-time 1 keeps the chain clock moving like a real network; on an
# idle chain anvil's latest block goes stale and time jumps when a tx lands.
anvil --hardfork london --block-time 1 --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null' EXIT

for _ in $(seq 1 50); do
  cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
  sleep 0.2
done

cd "$CONTRACTS_DIR"
PRIVATE_KEY=$DEPLOYER_KEY OWNER= USDC= forge script script/Deploy.s.sol \
  --rpc-url "$RPC" --broadcast --silent >/dev/null

RUN=broadcast/Deploy.s.sol/31337/run-latest.json
TRUEALERT=$(jq -r '[.transactions[] | select(.contractName=="TrueAlert")][0].contractAddress' "$RUN")
USDC=$(jq -r '[.transactions[] | select(.contractName=="MockUSDC")][0].contractAddress' "$RUN")
TRUEALERT=$(cast to-check-sum-address "$TRUEALERT")
USDC=$(cast to-check-sum-address "$USDC")

# 5,000 test USDC for the buyer (MockUSDC caps each mint at 10,000).
cast send "$USDC" "mint(address,uint256)" "$BUYER" 5000000000 \
  --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null

cat > "$APP_DIR/.env.local" <<EOF
# Written by scripts/local-chain.sh
NEXT_PUBLIC_CHAIN=local
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_TRUEALERT_ADDRESS=$TRUEALERT
NEXT_PUBLIC_USDC_ADDRESS=$USDC
NEXT_PUBLIC_ARBITER_ADDRESS=0x90F79bf6EB2c4f870365E785982E1f101E93b906

# Fixed rate locally: works offline and makes quotes identical on every run.
RATE_FIXED_NGN_PER_USD=1373.28
RATE_FIXED_ETN_USD=0.00114
EOF

echo "Local chain ready (London EVM) at $RPC"
echo "  TrueAlert  $TRUEALERT"
echo "  MockUSDC   $USDC"
echo "  Wrote app/.env.local — now run: pnpm dev   and   pnpm dev-link"
wait $ANVIL_PID
