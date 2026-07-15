# Growthip Contracts

Soroban smart contracts for the Growthip privacy tipping protocol, written
in Rust. This directory is a Cargo workspace with **five** members. A sixth
folder, `growthip-merkle-verifier`, still exists on disk but is **not**
listed in the workspace `Cargo.toml` — see the table below.

For the protocol-level design and security history, see the
[root README](../README.md) and [SECURITY.md](../SECURITY.md). This
document covers contract-level structure, build/test workflow, and
deployment.

---

## Workspace Members

| Crate | Role | Status |
|---|---|---|
| `pool-v5` | Shielded JoinSplit pool (2-in/2-out) — main escrow + claim contract | ✅ Active (testnet) |
| `verifier-v5` | Groth16/BN254 verifier, compiled in as a library (not a separately deployed contract) — verification key embedded at compile time | ✅ Active (testnet, linked into `pool-v5`'s wasm) |
| `poseidon2` | Poseidon2 over BN254 (CAP-0075 host permutation), parity-tested against the circom `poseidon2_compress` template | ✅ Active (testnet) |
| `zk-types` | Shared contract types for the V5 shielded pool (`TxProof`, etc.) | ✅ Active (testnet) |
| `growthip-creator-registry` | Global creator identity: encryption pubkey + premium status, deployed once (not per-token) | ✅ Active (testnet) |
| `growthip-merkle-verifier` | Legacy V4 Groth16 verifier (Protocol 25/26 BN254 host functions) | ⚠️ Orphaned — not in `Cargo.toml`'s `members` list, so it is not built by `cargo build --workspace` / `stellar contract build`. Kept only as a historical reference to the deprecated V4 flow; safe to delete once V4 is fully retired. |

All active members share `soroban-sdk = "26.0.1"` (with the
`hazmat-crypto` feature) via `[workspace.dependencies]`.

> **V4 → V5 status:** V4 (`growthip-merkle-verifier` above, plus the old
> `growthip-pool` crate, which has been removed from this workspace
> entirely) is no longer used by the frontend. V5 (`pool-v5` +
> `verifier-v5`) is the active, primary system. See
> [docs/testnet-deployment.md](../docs/testnet-deployment.md) for
> deployed addresses and current status of both.

---

## `pool-v5` — Structure

```text
contracts/pool-v5/
├── Cargo.toml
└── src/
    ├── lib.rs                   # Contract entry points (deposit/claim/
    │                             # transact(), etc.), #[contract] surface
    ├── merkle_onchain_v2.rs     # On-chain Merkle tree bookkeeping for
    │                             # the V5 Poseidon2 tree
    └── test.rs                  # Contract test module
```

Combines the Cyphras `transact()` security model (canonicality checks,
reentrancy lock, checks-effects-interactions ordering, TVL cap, on-chain
`extDataHash` recompute, per-pool domain replay protection) with Growthip
V4 conventions (root-history ring buffer, per-nullifier persistent
entries, privacy-safe events, admin/upgrade/pause surface) — per the
crate's own `lib.rs` doc comment.

*(File-by-file responsibilities above are inferred from filenames and the
crate-level doc comment, not a line-by-line read of
`merkle_onchain_v2.rs`/`test.rs` — worth a direct skim if you need more
detail than this summary.)*

---

## `verifier-v5` — Structure

```text
contracts/verifier-v5/
├── Cargo.toml
├── build.rs      # Embeds the verification key at compile time
└── src/
    └── lib.rs     # verify_groth16() — pure library (rlib), no
                    # #[contract]/#[contractimpl] wrapper
```

Adapted from `fxjrin/cyphras contracts/verifier` (Apache-2.0), with one
deliberate change from the V4 approach: this crate is **not** a
separately deployed Soroban contract. `verify_groth16()` is a plain Rust
function, statically linked into `pool-v5`'s own wasm binary. There is no
separate `verifier-v5` contract ID to deploy or manage — rotating the
verification key means rebuilding and redeploying `pool-v5` itself.

---

## `poseidon2` — Structure

```text
contracts/poseidon2/
├── Cargo.toml
└── src/
    ├── lib.rs          # Public compress()/hash() wrappers
    ├── constants.rs    # MDS matrix + round constants (t=2, t=3)
    ├── poseidon2.rs    # Core permutation logic
    └── parity_test.rs  # Pins reference vectors so the on-chain hash and
                         # the in-circuit hash (poseidon2_compress.circom)
                         # cannot silently diverge
```

Uses the CAP-0075 host permutation, with parameters matching the circom
`poseidon2_compress` template. Constants and wrappers are vendored from
`NethermindEth/stellar-private-payments` (Apache-2.0) — see
`ATTRIBUTION.md`.

---

## `zk-types` — Structure

```text
contracts/zk-types/
└── src/
    └── lib.rs   # TxProof and other shared V5 contract types
```

Adapted from `fxjrin/cyphras contracts/types` (Apache-2.0). `TxProof`
deliberately omits `domain`: each pool supplies its own stored domain as
the 4th public input, so a proof can't replay across pools even if both
embed the same verification key.

---

## `growthip-creator-registry` — Structure

```text
contracts/growthip-creator-registry/
├── Cargo.toml
└── src/
    └── lib.rs   # register_encryption_pubkey(), is_premium(),
                  # get_encryption_pubkey(), withdraw_fees(), tests
```

Unchanged from the original design — deliberately a **separate
contract**, not a field added to the pool contract. Reasoning: the pool
is deployed once per token (one instance for XLM, another for USDC,
etc.), but premium status and a creator's encryption public key are
properties of the *creator's wallet*, not of "the creator within one
specific pool." Putting this state inside a pool contract would mean a
creator paying the one-time premium activation fee once per token pool —
not the intended pricing model. See the
[root README's Creator Links & Sharing / premium section](../README.md)
for the user-facing design.

`register_encryption_pubkey()` charges a one-time fee (6 XLM by default,
adjustable post-deploy via `update_premium_fee()`) on the *first* call
for a given address, and is free on every subsequent call — this lets a
creator rotate their encryption key (e.g. after restoring access on a new
device via recovery phrase) without being charged again.

---

## Build

Build all active workspace members:

```bash
stellar contract build
```

Build a single contract:

```bash
stellar contract build --package pool-v5
```

Inspect a built contract's exported interface (useful for confirming no
unintended functions leak through, per
[SECURITY.md's Issue #2](../SECURITY.md#self-found-issue-2--verifier-interface-leak)):

```bash
stellar contract info interface \
  --wasm target/wasm32v1-none/release/pool_v5.wasm
```

> Wasm filenames above follow Cargo's usual dash→underscore convention
> (`pool-v5` → `pool_v5.wasm`) but weren't independently confirmed
> against an actual `target/` build this session — verify with
> `ls target/wasm32v1-none/release/*.wasm` after your first build.

---

## Test

Run the full workspace test suite:

```bash
cargo test --workspace
```

Run tests for one crate:

```bash
cd contracts/pool-v5 && cargo test
```

> The previous version of this doc claimed "38 passed, 0 failed, 5
> ignored" — that number was from the old 8-crate V4 workspace and isn't
> meaningful for the current 5-crate workspace. Run `cargo test
> --workspace` yourself (the run attempted this session got truncated by
> `tail -20` before the real pass/fail counts) and replace this note with
> the current numbers.

---

## Deploy (Testnet)

`verifier-v5` is **not deployed separately** — it's compiled into
`pool-v5`'s wasm (see "Structure" above). This sequence deploys the pool
and the creator registry, then initializes and configures each. Repeat
the pool-deploy steps once per token (e.g. once for XLM, once for USDC) —
pools are independent instances of the same WASM binary. The creator
registry is deployed **once total**, regardless of how many token pools
exist.

```bash
# 1. Deploy the pool (verifier-v5 is statically linked in — no separate
#    verifier deploy step, unlike V4)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/pool_v5.wasm \
  --source <your-identity> \
  --network testnet

# 2. Initialize — tip_amount MUST match the frontend's `baseUnit` for
#    that token (see apps/web/src/lib/tokens.ts). A mismatch here means
#    every deposit from the UI will be rejected.
stellar contract invoke \
  --id <pool-id> \
  --source <your-identity> \
  --network testnet \
  --send=yes \
  -- initialize \
  --admin <admin-address> \
  --tip_amount <base-unit-stroops> \
  --treasury <treasury-address>
  # NOTE: exact initialize() argument list not re-verified this session
  # against contracts/pool-v5/src/lib.rs — check before running.

# 3. Set the token (XLM SAC, USDC SAC, etc.)
stellar contract invoke \
  --id <pool-id> \
  --source <your-identity> \
  --network testnet \
  --send=yes \
  -- set_token \
  --admin <admin-address> \
  --token_addr <token-sac-address>

# 4. Deploy the creator registry (once, not per-token)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/growthip_creator_registry.wasm \
  --source <your-identity> \
  --network testnet

# 5. Initialize the registry
stellar contract invoke \
  --id <registry-id> \
  --source <your-identity> \
  --network testnet \
  --send=yes \
  -- initialize \
  --admin <admin-address> \
  --token_addr <token-sac-address> \
  --treasury <treasury-address>
```

---

## Upgrading After a Redeploy

There is no in-place "fix the address" option for Soroban contracts — a
new WASM hash means a new contract identity. After deploying a new
version of `pool-v5` or `growthip-creator-registry`:

1. Update `apps/web/.env.local` with the new contract IDs
2. Update the same variables in your hosting provider's environment
   variables (e.g. Vercel project settings) and trigger a redeploy
3. Update the addresses table in
   [docs/testnet-deployment.md](../docs/testnet-deployment.md)
4. Because `verifier-v5` is statically linked into `pool-v5` rather than
   deployed separately, rotating the verification key means rebuilding
   and redeploying `pool-v5` itself — there's no standalone
   `update_verifier()` admin call for V5 the way there was for V4
   (confirm against `contracts/pool-v5/src/lib.rs` if this ever comes up).

A pool with `total_deposits() == 0` can simply be discarded and
re-deployed fresh with corrected parameters. A pool with real deposits
would need a proper state-migration plan, which is out of scope for this
prototype.
