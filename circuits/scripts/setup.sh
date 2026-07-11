#!/usr/bin/env bash
# Phase-2 Groth16 trusted setup for transaction2x2.circom on BN254.
# Adapted from fxjrin/cyphras circuits/scripts/setup.sh (Apache-2.0).
#
# SOLO SETUP DISCLOSURE (must appear verbatim-in-spirit in the submission
# README): single-contributor phase 2 over the public Hermez powers-of-tau;
# fine for testnet, technically forgeable — mainnet requires an MPC ceremony.
#
# Circuit size: 62,807 constraints -> ptau power 16 (65,536) fits with ~4%
# headroom. If the circuit EVER grows past 65,536, switch to
# powersOfTau28_hez_final_17.ptau and update this script.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
KEYS="$ROOT/keys"
R1CS="$BUILD/transaction2x2.r1cs"
PTAU="$KEYS/powersOfTau28_hez_final_16.ptau"

if [ ! -f "$PTAU" ]; then
  echo "missing $PTAU" >&2
  echo "download: https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau" >&2
  exit 1
fi

if [ ! -f "$R1CS" ]; then
  echo "missing $R1CS, run: npm run build" >&2
  exit 1
fi

mkdir -p "$KEYS"

INIT_ZKEY="$KEYS/transaction2x2_0000.zkey"
CONTRIB_ZKEY="$KEYS/transaction2x2_0001.zkey"
FINAL_ZKEY="$KEYS/transaction2x2.zkey"
VK="$KEYS/verification_key.json"

npx snarkjs groth16 setup "$R1CS" "$PTAU" "$INIT_ZKEY"

# One contribution with strong OS entropy (non-interactive).
ENTROPY="$(head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')"
npx snarkjs zkey contribute "$INIT_ZKEY" "$CONTRIB_ZKEY" --name="growthip-solo-testnet" -e="$ENTROPY"

# Random beacon finalizes phase 2.
BEACON="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
npx snarkjs zkey beacon "$CONTRIB_ZKEY" "$FINAL_ZKEY" "$BEACON" 10 --name="final-beacon"

npx snarkjs zkey export verificationkey "$FINAL_ZKEY" "$VK"

rm -f "$INIT_ZKEY" "$CONTRIB_ZKEY"

echo "setup done:"
echo "  $FINAL_ZKEY"
echo "  $VK"
