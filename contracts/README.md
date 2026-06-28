# Growthip Contracts

Soroban smart contracts for the Growthip privacy tipping protocol, written
in Rust. This directory is a Cargo workspace with eight members.

For the protocol-level design and security history, see the
[root README](../README.md) and [SECURITY.md](../SECURITY.md). This
document covers contract-level structure, build/test workflow, and
deployment.

---

## Workspace Members

| Crate | Role | Status |
|---|---|---|
| `growthip-pool` | Main escrow + claim contract | ✅ Active (testnet) |
| `growthip-merkle-verifier-v4` | Native BN254 Groth16 verifier for the V4 circuit (depth-20, 1,048,576 leaves) | ✅ Active (testnet) |
| `growthip-merkle-verifier-v3-1` | Native BN254 Groth16 verifier for the V3.1 circuit (depth-3) | Deprecated — superseded by V4 |
| `growthip-creator-registry` | Global creator identity: encryption pubkey + premium status, deployed once (not per-token) | ✅ Active (testnet) |
| `growthip-merkle-verifier-v3` | Verifier for the V3 circuit (3 public inputs, no deposit-amount binding) | Deprecated — superseded by V3.1, see [SECURITY.md Issue #3](../SECURITY.md#self-found-issue-3--deposit-amount-aware-claims) |
| `growthip-merkle-verifier-v2` | V2 verifier | Deprecated — kept as a `dev-dependency` for one historical test only, not in the production build |
| `growthip-merkle-verifier` | V1 verifier | Deprecated — kept for reference/test coverage |
| `growthip-note-verifier` | V0 verifier (no Merkle proof) | Deprecated — kept for reference/test coverage |
| `square-verifier` | Verifier pipeline smoke test | Deprecated — kept for reference/test coverage |

All members share `soroban-sdk = "26.0.1"` via `[workspace.dependencies]`.

---

## `growthip-pool` — Structure

```text
contracts/growthip-pool/
├── Cargo.toml
└── src/
    ├── lib.rs                            # Contract entry points, DataKey,
    │                                      # claim()/claim_to()/deposit_paid()/
    │                                      # etc., #[cfg(test)] module
    ├── merkle_onchain.rs                 # rebuild_merkle_root() — on-chain
    │                                      # Merkle tree reconstruction using
    │                                      # the native Poseidon host function
    ├── poseidon_constants_generated.rs   # Auto-generated circomlib BN254
    │                                      # constants (C, M matrices) for
    │                                      # arities t=2, t=3, t=4. Regenerate
    │                                      # via scripts/extract_poseidon.js
    │                                      # if circomlib constants ever change
    ├── poseidon_verify_test.rs           # Verifies Soroban's native
    │                                      # poseidon_permutation() matches
    │                                      # circomlibjs byte-for-byte
    └── merkle_verify_test.rs             # Verifies on-chain Merkle root
                                           # matches the frontend's merkle.ts
```

### Why `poseidon_constants_generated.rs` exists

Soroban's `poseidon_permutation` host function (CAP-0075, Protocol 25) is
a **low-level primitive** — it takes the MDS matrix and round constants as
explicit parameters, rather than baking in a specific hash function. To
get output identical to `circomlibjs` (used by the frontend), the exact
same BN254 Poseidon constants must be supplied.

This file is **generated, not hand-written**, by
`scripts/extract_poseidon.js`, which reads `circomlibjs`'s
`poseidon_constants.json` (the raw/non-optimized constant set — not
`poseidon_constants_opt.json`, which is structurally a sparse-matrix
decomposition unsuited to this host function's generic interface) and
emits Rust constants in the byte-array format `U256::from_be_bytes`
expects.

**Do not hand-edit this file.** If you ever need to regenerate it:

```bash
node scripts/extract_poseidon.js
```

Then re-run `poseidon_verify_test.rs` to confirm parity still holds before
trusting the new constants anywhere near `claim()` or
`deposit_internal()`.

### Why the Merkle tree uses an incremental frontier approach

The V4 circuit uses a **depth-20 incremental tree (max 1,048,576 leaves)**.
`deposit_internal()` updates only the frontier nodes — the right-most filled
node at each level — and recomputes just the path from the new leaf to the
root (20 Poseidon calls per deposit, regardless of tree size). This replaces
the old fixed-depth-3 rebuild approach (7 calls, max 8 leaves) that required
pool redeployment every 8 deposits.

The frontier (depth-20 nodes) is stored in contract instance storage under
`DataKey::Frontier`. A bounded root history (`ROOT_HISTORY_SIZE = 64`) allows
claims to be validated against recent roots even if new deposits arrive
between proof generation and claim submission.

### Why `claim_to()` looks up `CommitmentAmount(index)` instead of a flat `TipAmount`

This is the fix for a critical bug found via a real testnet transaction —
see [SECURITY.md, Issue #3](../SECURITY.md#self-found-issue-3--deposit-amount-aware-claims)
for the full story. In short: deposits accept 1x/5x/10x/20x the pool's
base denomination, but the original `claim_to()` always paid out a flat
1x regardless of what was actually deposited. The V3.1 circuit's fourth
public output (`index`, the deposit's Merkle leaf position) lets
`claim_to()` look up the real deposited amount instead.

---

## `growthip-creator-registry` — Structure

```text
contracts/growthip-creator-registry/
├── Cargo.toml
└── src/
    └── lib.rs   # register_encryption_pubkey(), is_premium(),
                 # get_encryption_pubkey(), withdraw_fees(), tests
```

Deliberately a **separate contract**, not a field added to
`growthip-pool`. Reasoning: `growthip-pool` is deployed once per token
(one instance for XLM, another for USDC, etc.), but premium status and a
creator's encryption public key are properties of the *creator's wallet*,
not of "the creator within one specific pool." Putting this state inside
`growthip-pool` would mean a creator paying the one-time premium
activation fee once per token pool — not the intended pricing model. See
the [root README's Creator Links & Sharing / premium section](../README.md)
for the user-facing design.

`register_encryption_pubkey()` charges a one-time fee (6 XLM by default,
adjustable post-deploy via `update_premium_fee()`) on the *first* call for
a given address, and is free on every subsequent call — this lets a
creator rotate their encryption key (e.g. after restoring access on a new
device via recovery phrase) without being charged again.

---

## Build

Build all contracts:

```bash
stellar contract build
```

Build a single contract:

```bash
stellar contract build --package growthip-pool
```

Inspect a built contract's exported interface (useful for confirming no
unintended functions leak through, per
[SECURITY.md's Issue #2](../SECURITY.md#self-found-issue-2--verifier-interface-leak)):

```bash
stellar contract info interface \
  --wasm target/wasm32v1-none/release/growthip_pool.wasm
```

---

## Test

Run the full workspace test suite:

```bash
cargo test --workspace
```

Run tests for one crate:

```bash
cd contracts/growthip-pool && cargo test
```

Run a specific test:

```bash
cd contracts/growthip-pool && cargo test test_claim_to_with_v3_1_verifier_pays_actual_deposited_amount
```

As of the current deployment, the full workspace suite reports
**38 passed, 0 failed, 5 ignored** (the three ignored tests are
intentionally disabled outdated V2 fixtures — see each test's inline
`#[ignore = "..."]` reason, or
[SECURITY.md](../SECURITY.md#self-found-issue-1--root-forgery) for the
full explanation).

---

## Deploy (Testnet)

This sequence deploys a verifier, a pool, and the creator registry, then
initializes and configures each. Repeat the pool-deploy steps once per
token (e.g. once for XLM, once for USDC) — pools are independent
instances of the same WASM binary. The creator registry, by contrast, is
deployed **once total**, regardless of how many token pools exist.

```bash
# 1. Deploy the verifier
stellar contract deploy \
  --wasm target/wasm32v1-none/release/growthip_merkle_verifier_v4.wasm \
  --source <your-identity> \
  --network testnet

# 2. Deploy the pool
stellar contract deploy \
  --wasm target/wasm32v1-none/release/growthip_pool.wasm \
  --source <your-identity> \
  --network testnet

# 3. Initialize — tip_amount MUST match the frontend's `baseUnit` for that
#    token (see apps/web/src/lib/tokens.ts). A mismatch here means every
#    deposit from the UI will be rejected by deposit_paid()'s denomination
#    check.
stellar contract invoke \
  --id <pool-id> \
  --source <your-identity> \
  --network testnet \
  --send=yes \
  -- initialize \
  --admin <admin-address> \
  --verifier <verifier-id> \
  --root 0000000000000000000000000000000000000000000000000000000000000000 \
  --tip_amount <base-unit-stroops> \
  --treasury <treasury-address>

# 4. Set the token (XLM SAC, USDC SAC, etc.)
stellar contract invoke \
  --id <pool-id> \
  --source <your-identity> \
  --network testnet \
  --send=yes \
  -- set_token \
  --admin <admin-address> \
  --token_addr <token-sac-address>

# 5. Deploy the creator registry (once, not per-token)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/growthip_creator_registry.wasm \
  --source <your-identity> \
  --network testnet

# 6. Initialize the registry -- token_addr is whichever asset premium
#    fees are charged in (XLM, in Growthip's deployment), independent of
#    which token(s) the creator later receives tips through.
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

The `--root` value passed to `initialize` is effectively a placeholder —
it sets the legacy `CurrentRoot` storage value (used only for display,
not for claim validation; see
[SECURITY.md](../SECURITY.md#self-found-issue-1--root-forgery)), and the
real root-history that claims are checked against starts empty and is
populated only by actual `deposit_paid()` calls.

### Verifying a deployment

```bash
# Confirm token is set correctly
stellar contract invoke --id <pool-id> --source <identity> --network testnet -- token

# Confirm tip_amount matches the frontend's expectation
stellar contract invoke --id <pool-id> --source <identity> --network testnet -- tip_amount

# Confirm a fresh pool starts at zero deposits
stellar contract invoke --id <pool-id> --source <identity> --network testnet -- total_deposits

# Confirm the registry's premium fee matches expectations (60000000 = 6 XLM)
stellar contract invoke --id <registry-id> --source <identity> --network testnet -- premium_fee
```

---

## Upgrading After a Redeploy

There is no in-place "fix the address" option for Soroban contracts — a
new WASM hash means a new contract identity. After deploying a new
version of `growthip-pool`, `growthip-merkle-verifier-v3-1`, or
`growthip-creator-registry`:

1. Update `apps/web/.env.local` with the new contract IDs
2. Update the same variables in your hosting provider's environment
   variables (e.g. Vercel project settings) and trigger a redeploy
3. Update the addresses table in the [root README](../README.md#testnet-deployment)
4. If the WASM hash of a dependency contract changed too (e.g. the
   verifier), redeploy and reinitialize anything that points to it —
   `growthip-pool`'s `verifier` address is set once at `initialize()` and
   changeable afterward only via the admin-gated `update_verifier()`

A pool with `total_deposits() == 0` can simply be discarded and
re-deployed fresh with corrected parameters (as happened multiple times
during this project's own development — the root-validation fix, the
verifier-interface-leak fix, and the deposit-amount-aware claims fix each
required a fresh pool deployment; see [SECURITY.md](../SECURITY.md) for
the full history of each). A pool with real deposits would need a proper
state-migration plan, which is out of scope for this prototype.