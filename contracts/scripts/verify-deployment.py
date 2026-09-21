#!/usr/bin/env python3
"""Check that deployed contracts are exactly what this repo compiles to.

Compares on-chain runtime bytecode with `forge build` output, byte for byte.
The only bytes allowed to differ are immutables (values set in the
constructor), which are masked using the compiler's own immutableReferences
map. The trailing CBOR metadata embeds a hash of the exact source files and
compiler settings, so a match proves the deployment came from this source.

This gives the same guarantee as block-explorer source verification, and
works while the Electroneum testnet explorer is unavailable.

Usage (from contracts/):
    forge build
    python3 scripts/verify-deployment.py                      # testnet defaults
    python3 scripts/verify-deployment.py --rpc <url> \\
        TrueAlert=0x... MockUSDC=0x...

Requires Foundry's `cast` on PATH.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

TESTNET_RPC = "https://rpc.ankr.com/electroneum_testnet"
TESTNET_DEPLOYMENT = {
    "TrueAlert": "0x83A51C54C78a84fAF09d34B92c8475B9F12a5d34",
    "MockUSDC": "0x3F2f8D53F9A306eF2A1eF819EC8844883c1916a5",
}

OUT = Path(__file__).resolve().parent.parent / "out"


def masked(code: bytes, ranges: list[tuple[int, int]]) -> bytes:
    buf = bytearray(code)
    for start, length in ranges:
        buf[start : start + length] = b"\x00" * length
    return bytes(buf)


def check(name: str, address: str, rpc: str) -> bool:
    artifact_path = OUT / f"{name}.sol" / f"{name}.json"
    if not artifact_path.exists():
        print(f"{name}: no build artifact at {artifact_path} (run `forge build` first)")
        return False
    artifact = json.loads(artifact_path.read_text())
    local = bytes.fromhex(artifact["deployedBytecode"]["object"].removeprefix("0x"))

    onchain_hex = subprocess.check_output(["cast", "code", address, "--rpc-url", rpc], text=True).strip()
    onchain = bytes.fromhex(onchain_hex.removeprefix("0x"))
    if not onchain:
        print(f"{name}: no contract code at {address}")
        return False

    refs = artifact["deployedBytecode"].get("immutableReferences") or {}
    ranges = [(r["start"], r["length"]) for slots in refs.values() for r in slots]

    same = len(local) == len(onchain) and masked(local, ranges) == masked(onchain, ranges)
    cbor = int.from_bytes(local[-2:], "big") + 2
    metadata_same = local[-cbor:] == onchain[-cbor:]

    verdict = "MATCHES" if same and metadata_same else "DOES NOT MATCH"
    print(
        f"{name} at {address}: {verdict} "
        f"({len(onchain)} bytes; {len(ranges)} immutable slots masked; "
        f"source metadata hash {'matches' if metadata_same else 'differs'})"
    )
    return same and metadata_same


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rpc", default=TESTNET_RPC)
    parser.add_argument("contracts", nargs="*", help="Name=0xAddress pairs (default: the testnet deployment)")
    args = parser.parse_args()

    targets = dict(pair.split("=", 1) for pair in args.contracts) if args.contracts else TESTNET_DEPLOYMENT
    results = [check(name, address, args.rpc) for name, address in targets.items()]
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
