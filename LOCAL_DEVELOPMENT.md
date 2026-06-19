# Local Development Guide

End-to-end setup for running Growthip locally: circuits, contracts, and
frontend. For protocol design, see the [root README](README.md). For
security details, see [SECURITY.md](SECURITY.md).

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [1. Clone & Install](#1-clone--install)
- [2. Circuit Toolchain](#2-circuit-toolchain)
- [3. Build & Test Contracts](#3-build--test-contracts)
- [4. Deploy Contracts (Testnet)](#4-deploy-contracts-testnet)
- [5. Configure & Run the Frontend](#5-configure--run-the-frontend)
- [6. Manual End-to-End Test](#6-manual-end-to-end-test)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 18+ | `node --version` |
| Rust + Cargo | stable | `cargo --version` |
| Stellar CLI | 26+ | `stellar --version` |
| circom | 2.1.6+ | `circom --version` |
| snarkjs | latest | `npx snarkjs --version` |
| Freighter | browser extension | [freighter.app](https://www.freighter.app) |

A funded Stellar Testnet account is required for deployment and
on-chain testing:

```bash
stellar keys generate <your-identity> --network testnet
stellar keys fund <your-identity> --network testnet
```

---

## 1. Clone & Install

```bash
git clone https://github.com/dzakwannajmi/Growthip
cd growthip
npm install
```

This installs both the root workspace dependencies (used by the
circuit/contract helper scripts) and triggers `npm install` inside
`apps/web` via the npm workspaces configuration.

---

## 2. Circuit Toolchain

The V3 circuit and its proving artifacts are already compiled and
checked into `circuits/build/` for convenience — you do **not** need to
recompile the circuit just to run the app locally against the existing
testnet deployment.

You only need this section if you're modifying the circuit itself.

```bash
# Compile the circuit
circom circuits/growthip_merkle_note_v3.circom \
  --r1cs --wasm --sym \
  -o circuits/build

# Powers of Tau (reuse an existing .ptau file rather than generating
# your own — see SECURITY.md's Trusted Setup section for why this
# matters)
snarkjs groth16 setup \
  circuits/build/growthip_merkle_note_v3.r1cs \
  <path-to-ptau-file> \
  circuits/build/growthip_merkle_note_v3_0.zkey

# Phase-2 contribution (local, for development only — see
# SECURITY.md Trusted Setup for the production-grade alternative)
snarkjs zkey contribute \
  circuits/build/growthip_merkle_note_v3_0.zkey \
  circuits/build/growthip_merkle_note_v3_final.zkey

# Export the verification key
snarkjs zkey export verificationkey \
  circuits/build/growthip_merkle_note_v3_final.zkey \
  circuits/build/growthip_merkle_note_v3_verification_key.json
```

If you change the circuit, the verifier contract's hardcoded verifying
key (compiled in at build time from `circuits/build/..._parameters.json`)
must be regenerated and the verifier contract redeployed — see
[contracts/README.md](contracts/README.md#why-the-merkle-tree-is-rebuilt-not-updated-incrementally).

---

## 3. Build & Test Contracts

```bash
# Build all contracts
stellar contract build

# Run the full test suite
cargo test --workspace
```

Expect **25 passed, 0 failed, 3 ignored**. The three ignored tests are
intentionally disabled — see
[SECURITY.md](SECURITY.md#self-found-issue-1--root-forgery) for why.

If you've modified `contracts/growthip-pool/src/lib.rs` and touched
anything related to Poseidon or Merkle root logic, run the parity tests
specifically before trusting any change:

```bash
cd contracts/growthip-pool
cargo test poseidon_verify_test
cargo test merkle_verify_test
```

Both must pass before any root/hash-related change is safe to deploy —
they're the only thing standing between "looks right" and "is
byte-for-byte identical to what the frontend actually computes."

---

## 4. Deploy Contracts (Testnet)

Full deploy walkthrough, including the denomination-matching pitfall
that bit this exact project during its own development, is in
[contracts/README.md](contracts/README.md#deploy-testnet).

Quick version:

```bash
# Verifier
stellar contract deploy \
  --wasm target/wasm32v1-none/release/growthip_merkle_verifier_v3.wasm \
  --source <identity> --network testnet

# Pool
stellar contract deploy \
  --wasm target/wasm32v1-none/release/growthip_pool.wasm \
  --source <identity> --network testnet

# Initialize — tip_amount MUST match apps/web/src/lib/tokens.ts'
# baseUnit for the token this pool is for, or every deposit from the
# UI will be rejected
stellar contract invoke --id <pool-id> --source <identity> --network testnet \
  --send=yes -- initialize \
  --admin <admin> --verifier <verifier-id> \
  --root 0000000000000000000000000000000000000000000000000000000000000000 \
  --tip_amount <base-unit-stroops> --treasury <treasury-address>

stellar contract invoke --id <pool-id> --source <identity> --network testnet \
  --send=yes -- set_token --admin <admin> --token_addr <token-sac>
```

---

## 5. Configure & Run the Frontend

```bash
cd apps/web
cp .env.example .env.local
```

Fill in `.env.local` with the contract addresses from step 4 (or from
the existing testnet deployment — see
[testnet.env](testnet.env) and the
[root README's deployment table](README.md#testnet-deployment)).

```bash
npm run dev
# http://localhost:3000
```

---

## 6. Manual End-to-End Test

A full local verification that deposit → claim actually works, before
trusting any change:

1. Connect Freighter (testnet account, funded with XLM/USDC via
   `stellar keys fund` or a testnet faucet)
2. From the dashboard, **Send Tip** — pick a token and a preset amount,
   confirm the deposit transaction in Freighter
3. Save the private note shown after a successful deposit (copy it
   somewhere safe — this is the only way to claim it)
4. Switch to the **Withdraw** tab (or go to **Activity** and click
   **Claim** on the pending note)
5. Paste the note, confirm — the browser will generate a Groth16 proof
   (5–15 seconds), then submit `claim_to()` via Freighter
6. Confirm: recipient balance increases by 99% of the tip amount,
   `accumulated_fees()` on the pool increases by the remaining 1%
7. Check the transaction on
   [Stellar Expert (testnet)](https://stellar.expert/explorer/testnet)
   using the tx hash shown after a successful claim

If step 5 or 6 fails, check first whether the on-chain `tip_amount()`
matches the `baseUnit` your frontend tried to deposit — this exact
mismatch caused a real redeploy during this project's development (see
[contracts/README.md](contracts/README.md#deploy-testnet)).

---

## Troubleshooting

**`deposit_paid` panics with "amount must be 1x, 5x, 10x, or 20x the
base denomination"**
The pool's on-chain `tip_amount` doesn't match the `baseUnit` your
frontend computed for that token. Check both:
```bash
stellar contract invoke --id <pool-id> --source <identity> --network testnet -- tip_amount
```
against `apps/web/src/lib/tokens.ts`'s `baseUnit` for that token symbol.

**`claim_to` returns `false` with no panic message**
Soroban returns `false` rather than panicking for most claim-validation
failures, by design (see [SECURITY.md](SECURITY.md)). Check, in order:
root validity (was this note's commitment actually deposited into *this*
pool?), nullifier reuse (already claimed?), recipient hash match (is the
connected wallet the one registered for this note?).

**Poseidon/Merkle test failures after modifying the circuit or
constants**
Regenerate `poseidon_constants_generated.rs` via
`node scripts/extract_poseidon.js`, then re-run
`cargo test poseidon_verify_test merkle_verify_test` before touching
anything downstream. See
[contracts/README.md](contracts/README.md#why-poseidon_constants_generatedrs-exists).

**`stellar contract build` succeeds but `verify()` (or another
unexpected function) shows up in `stellar contract info interface`**
Check whether any contract crate is being imported as a full Rust
dependency (`path = "..."`) rather than called purely through its
on-chain address with a minimal client trait — see
[SECURITY.md's Issue #2](SECURITY.md#self-found-issue-2--verifier-interface-leak)
for the exact pattern and fix.