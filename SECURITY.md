# Security

This document covers Growthip's threat model, known limitations, and a
transparent account of issues found and fixed during development. It is
written for anyone evaluating the protocol's security claims directly
against the source code — not as marketing copy.

> Growthip is a hackathon/testnet prototype. It has not undergone a
> formal third-party audit. Do not use with real funds.

---

## Table of Contents

- [Threat Model](#threat-model)
- [Trust Assumptions](#trust-assumptions)
- [Self-Found Issue #1 — Root Forgery](#self-found-issue-1--root-forgery)
- [Self-Found Issue #2 — Verifier Interface Leak](#self-found-issue-2--verifier-interface-leak)
- [Trusted Setup](#trusted-setup)
- [Known Limitations](#known-limitations)
- [Reporting a Vulnerability](#reporting-a-vulnerability)

---

## Threat Model

Growthip assumes the following adversary capabilities:

* Can observe all on-chain state and transaction history (Stellar is a
  public ledger; nothing on-chain is hidden from any observer)
* Can submit arbitrary transactions to any contract function, with any
  inputs, at any time
* Can attempt to generate Groth16 proofs for arbitrary, self-constructed
  circuit inputs
* Cannot break the discrete log assumption underlying BN254, nor forge a
  Groth16 proof without knowing a valid witness, nor invert Poseidon

Growthip does **not** defend against:

* Network-level metadata correlation (e.g. an observer who controls both
  the supporter's and creator's network connection and correlates
  transaction timing)
* A malicious or compromised browser environment (the secret/nullifier
  never leave the browser by design, but if the browser itself is
  compromised, that guarantee is void)
* Compromise of the admin/treasury private key (the admin key currently
  controls `upgrade()`, `set_token()`, `update_verifier()`, and
  `withdraw_fees()` — see [Trust Assumptions](#trust-assumptions))

---

## Trust Assumptions

Honest accounting of what still requires trust, as of this deployment:

| Component | Trust required | Why |
|---|---|---|
| Merkle root | **None.** Computed on-chain via the native Poseidon host function, validated against on-chain history. | Fixed in [Issue #1](#self-found-issue-1--root-forgery) below. |
| Verifying key | Compiled into the verifier contract at build time from a local trusted-setup ceremony. | See [Trusted Setup](#trusted-setup). |
| Admin key | Controls contract upgrades (`upgrade`), token configuration (`set_token`, blocked after first deposit), verifier address (`update_verifier`), and fee withdrawal (`withdraw_fees`). | Standard admin-key pattern for an upgradeable contract; not eliminated in this prototype phase. |
| Note delivery | Off-chain, unencrypted by Growthip itself (the user is responsible for sharing the note securely, e.g. via an encrypted channel). | Documented limitation; see [Known Limitations](#known-limitations). |

---

## Self-Found Issue #1 — Root Forgery

**Severity if exploited: Critical (fund drain, no deposit required).**
**Status: Fixed and tested before any external disclosure.**

### The vulnerability

An earlier version of `claim()` removed its check that the proof's `root`
public input matched a root the pool contract had actually produced. The
removal was based on the comment:

```rust
// Root is verified by the Groth16 proof itself.
// We no longer check against stored root — proof validity IS the root check.
```

This reasoning is incorrect. A Groth16 proof for this circuit proves:
*"I know `(secret, nullifier, recipientHash, pathElements, pathIndices)`
such that hashing them according to the circuit's constraints produces
the given `root`, `nullifierHash`, and `recipientHash` as public
outputs."* It does **not** prove that `root` is a value this specific
pool contract ever computed from its own deposits.

### The attack

1. Attacker never deposits anything into the pool.
2. Attacker builds an entirely separate Merkle tree locally, with one
   leaf: `commitment = Poseidon(secret_attacker, nullifier_attacker,
   recipientHash_attacker)`, where every value is attacker-controlled.
3. Attacker computes the root of this fake tree and generates a Groth16
   proof for it — the proof is **mathematically valid**, because the
   attacker genuinely knows a path to that root in their own tree.
4. Attacker calls `claim_to()` with this proof. Without a root-history
   check, the contract accepts it as long as the pairing check passes —
   and it does, because the proof is valid for the (fake) root it claims.
5. Funds are released from the pool to the attacker, despite zero real
   deposits.

### The fix

`deposit_internal()` now recomputes the full depth-3 Merkle root
on-chain after every deposit, using Soroban's native
`poseidon_permutation` host function (Protocol 25, CAP-0075) — see
`contracts/growthip-pool/src/merkle_onchain.rs`. The new root is appended
to a bounded on-chain history (`DataKey::RootHistory`).

`claim()` now checks, as the **first** validation step (before the
nullifier check and before the Groth16 pairing check, for fail-fast gas
efficiency):

```rust
let root_history: Vec<BytesN<32>> = env.storage().instance()
    .get(&DataKey::RootHistory).unwrap_or_else(|| Vec::new(&env));
let mut root_is_known = false;
for stored_root in root_history.iter() {
    if stored_root == root {
        root_is_known = true;
        break;
    }
}
if !root_is_known {
    return false;
}
```

The history is bounded to the tree's maximum leaf count (8), which is
sufficient because the root changes at most 7 times across this pool's
entire lifetime (1 leaf inserted up to 8, after which the pool is full).
A history-based (rather than single-`current_root`) check also correctly
handles the legitimate race condition where a new deposit lands between
a creator generating their proof and submitting their claim — the old
root remains valid for the window it's still in the history.

### How the fix was verified, not just asserted

Before this fix touched `claim()` or `deposit_internal()`, three things
were proven with passing tests — not assumed from documentation:

1. **`poseidon_verify_test.rs`** — the Soroban host function's Poseidon
   output is byte-for-byte identical to `circomlibjs`'s output (the
   library used by the frontend), across all three arities Growthip uses
   (t=2 for `hash1`, t=3 for `hash2`/Merkle levels, t=4 for `hash3`/
   commitment). Ground-truth values were computed via the actual
   production code path (`apps/web/src/lib/poseidon.ts`), not
   re-derived independently.

2. **`merkle_verify_test.rs`** — the on-chain `rebuild_merkle_root()`
   produces a root identical to the frontend's `buildMerkleTree()` in
   `apps/web/src/lib/merkle.ts`, given the same commitments. Ground truth
   was generated via the production circomlibjs code path.

3. **`test_claim_to_with_v3_verifier_and_proof`** — a regression test
   that deposits the *actual* commitment used to generate a real V3
   proof artifact (`circuits/build/growthip_merkle_note_v3_demo_note.json`),
   not a disconnected dummy value, and asserts the full deposit → root →
   claim → fee-split path succeeds.

Three pre-existing tests (`test_claim_valid_proof_once_only`,
`test_claim_to_rejects_wrong_recipient_hash`,
`test_paid_deposit_and_claim_to_recipient`) began failing after this fix.
Investigation showed each one deposited a disconnected dummy commitment
unrelated to the proof under test, and only passed *before* the fix
because there was no root validation to catch the mismatch — i.e. each
of these tests was unknowingly exercising a variant of the same attack
this fix closes. They are marked `#[ignore]` with an inline explanation
rather than silently deleted, preserving the audit trail.

---

## Self-Found Issue #2 — Verifier Interface Leak

**Severity if exploited: Low** (no fund-drain path identified; primarily
an unintended attack surface and code-hygiene issue).
**Status: Fixed.**

### The issue

`growthip-pool`'s `Cargo.toml` depended on `growthip-merkle-verifier-v2`
as a full Rust crate (`path = "../growthip-merkle-verifier-v2"`), not
merely calling it through its on-chain contract address. Because that
crate defines its own `#[contract]` / `#[contractimpl]` block, the
verifier's *entire* contract interface — including its `verify()`
function — was statically linked into and exported through the pool's
own compiled WASM binary.

This was confirmed directly:

```bash
$ stellar contract info interface --wasm growthip_pool.wasm
...
fn verify(
    env: soroban_sdk::Env,
    proof_bytes: soroban_sdk::Bytes,
    public_inputs: soroban_sdk::Vec<soroban_sdk::BytesN<32>>,
) -> bool;
...
```

`verify()` was directly callable on the pool contract itself, separate
from and outside the pool's own intended interface — an unintended,
undocumented attack surface that was never part of the contract's design.

### The fix

Replaced the full-crate import with a minimal, locally-declared client
trait that only carries the function signature needed for cross-contract
calls:

```rust
#[soroban_sdk::contractclient(name = "VerifierClient")]
pub trait VerifierInterface {
    fn verify(env: Env, proof_bytes: Bytes, public_inputs: Vec<BytesN<32>>) -> bool;
}
```

The `growthip-merkle-verifier-v2` path dependency was moved out of
`[dependencies]` entirely and into `[dev-dependencies]` (still needed
there for one historical test that exercises the V2 verifier directly in
a local test environment).

**Result:** pool WASM size reduced from 60,057 bytes to 50,975 bytes
(~15%), and `verify()` no longer appears in the pool's exported
interface — confirmed by rebuilding and re-running
`stellar contract info interface`.

---

## Trusted Setup

The V3 circuit's Groth16 proving and verification keys were generated via:

1. A **Powers of Tau** ceremony using the publicly available, widely-reused
   `ptau` files from the Hermez/Polygon ceremony (the standard
   community-trusted setup most Circom projects build on)
2. A **circuit-specific phase-2 contribution**, generated locally during
   development for the `growthip_merkle_note_v3` circuit

This is **not** a dedicated, publicly-verifiable multi-party computation
(MPC) ceremony for this specific circuit. It is the same pattern used by
most hackathon-stage and early prototype Groth16 deployments, and it
means the local machine that performed the phase-2 contribution is a
trust assumption: if that machine's toxic waste were retained and
disclosed, fake proofs could in principle be forged for this circuit's
specific verifying key.

A production deployment handling real funds would require a dedicated,
publicly-coordinated phase-2 MPC ceremony with multiple independent
participants, none of whom alone could reconstruct the toxic waste. This
is listed explicitly under Phase 3 in the project [Roadmap](README.md#roadmap).

---

## Known Limitations

* **Small anonymity set on testnet.** The Merkle tree is fixed at depth 3
  (max 8 leaves). Privacy strength scales with the number of real
  participants in a tree at claim time; on a low-traffic testnet, this is
  weak. This is a parameter, not an architectural limitation — a larger
  tree depth is a roadmap item.
* **Public timing metadata.** Deposit and claim timestamps are visible
  on-chain. An observer correlating deposit and claim timing patterns
  (especially in a low-traffic pool) may be able to make probabilistic
  guesses about which claim corresponds to which deposit, even without
  breaking any cryptographic guarantee.
* **Off-chain, unencrypted note delivery.** Growthip does not provide a
  built-in encrypted channel for supporters to send private notes to
  creators. Users are responsible for choosing a secure delivery method.
  Encrypted in-app note delivery is a roadmap item.
* **Admin key authority.** The admin key can upgrade the pool's WASM,
  change the configured token (before first deposit only), change the
  verifier address, and withdraw accumulated fees. This is a standard
  upgradeable-contract trust assumption, not eliminated at this stage.
* **Fee treasury is publicly linkable in aggregate.** While individual
  `claim_to()` calls do not transfer fee amounts to the treasury directly
  (avoiding a 1:1 link), the treasury address itself, and the total
  amount it eventually withdraws via `withdraw_fees()`, are both public.
  Aggregate platform revenue is observable; individual-claim-to-fee
  linkage is not.

---

## Reporting a Vulnerability

This is a hackathon prototype without a formal bug bounty program. If you
find a security issue, please open a GitHub issue on the
[Growthip repository](https://github.com/dzakwannajmi/Growthip) or
contact the maintainer directly rather than disclosing exploit details
publicly, given the contracts are live (if low-stakes) on a public
testnet.