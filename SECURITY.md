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
- [Self-Found Issue #3 — Deposit-Amount-Aware Claims](#self-found-issue-3--deposit-amount-aware-claims)
- [Private Note Encryption (Phase 3)](#private-note-encryption-phase-3)
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
| Note delivery | For premium creators: end-to-end encrypted (X25519 + AES-GCM), mandatory with no plaintext fallback. For non-premium: not applicable — a creator must activate encryption to receive tips at all. | See [Private Note Encryption](#private-note-encryption-phase-3) and [Known Limitations](#known-limitations). |

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

## Self-Found Issue #3 — Deposit-Amount-Aware Claims

**Severity: Critical (permanent fund lockup, discovered in live production
testnet use, not merely theoretical).**
**Status: Fixed and verified on-chain.**

### The bug

`claim_to()` always paid out a flat `DataKey::TipAmount` (the pool's base
denomination) to the recipient, regardless of how much was actually
deposited. Growthip's `deposit_paid()` accepts 1x, 5x, 10x, or 20x the
base unit — but `claim_to()` had no way to know which multiple a given
proof corresponded to, so it always paid out 1x.

The code's own comment, written during an earlier development pass,
already flagged this as incomplete:

```rust
// Transfer the exact amount that was deposited with this commitment
// We use total_claims as index proxy — in production use nullifier→index mapping
let base_amount: i128 = env.storage().instance().get(&DataKey::TipAmount)...
```

The comment described the intended fix; the code below it never
implemented it.

### How it was found

Not through code review — through a real testnet transaction. A 20 XLM
tip was sent, and the on-chain claim transaction showed only 0.99 XLM
(99% of the 1x base unit) credited to the recipient, with no error and
no panic. The remaining ~19 XLM had no code path that could ever move it
out of the pool — `claim_to()` only ever reads `TipAmount`, never
`CommitmentAmount(index)` for any index above the implicit assumption of
"the most recent one."

### Why this was structurally hard to fix

The ZK proof's public inputs (`root`, `nullifierHash`, `recipientHash`)
never carried which leaf index the deposit lived at. A Groth16 proof
proves *"I know a path to a leaf with this root"* without revealing
*which* leaf — that's the privacy property working as intended, but it
also meant the contract had no way to look up the deposit's actual
amount without either (a) breaking privacy by requiring a public
commitment value as an extra parameter (which would let anyone watching
the mempool front-run claim transactions by directly observing the
target leaf), or (b) adding `index` itself as a new public output of
the circuit.

### The fix: V3.1 circuit

`circuits/growthip_merkle_note_v3_1.circom` adds `index` as a fourth
public output, computed from the `pathIndices[]` bits the circuit
already used to prove Merkle membership — no new private inputs needed:

```circom
signal indexAcc[DEPTH + 1];
indexAcc[0] <== 0;
for (var i = 0; i < DEPTH; i++) {
    ...
    indexAcc[i + 1] <== indexAcc[i] + pathIndices[i] * (2 ** i);
}
index <== indexAcc[DEPTH];
```

This reveals only the deposit's position in a (small, depth-3, max
8-leaf) Merkle tree — not the depositor's identity, not the secret, not
the nullifier preimage. The position is no more sensitive than the
commitment list itself, which is already fully public on-chain.

Before trusting this derivation, the bit ordering was checked against
`apps/web/src/lib/merkle.ts`'s `getMerklePathByIndex()` (which pushes
bits LSB-first), and the circuit's output was verified against a manual
calculation for a *non-trivial* leaf (index 5, not the trivially-passing
index 0 case, where a broken derivation could coincidentally still
output 0).

`growthip-pool`'s `claim()` and `claim_to()` were updated to expect 4
public inputs instead of 3. `claim_to()` now extracts `index` from
`public_inputs[3]`, looks up `DataKey::CommitmentAmount(index)` —
written at deposit time and already present in storage — and uses that
as the actual payout base, instead of the flat `TipAmount`.

### A second bug found while fixing the first

The initial patch updated the public-input length check inside `claim()`
but missed an *identical, separate* length check at the top of
`claim_to()` (`if public_inputs.len() != 3 { return false; }`) — a
near-duplicate guard that existed for early-exit efficiency before
calling into `claim()`. This meant `claim_to()` always returned `false`
immediately, before ever reaching the new `index`-based logic, even
though `claim()` alone worked correctly when tested directly.

This was caught through systematic isolation debugging — calling
`claim()` directly (bypassing `claim_to()`'s extra checks) to confirm
the root/nullifier/verify layer succeeded, then checking each of
`claim_to()`'s additional guards (recipient-hash match) individually —
rather than guessing at the cause from the failing assertion alone.

### Verification before deploying

A new regression test, `test_claim_to_with_v3_1_verifier_pays_actual_deposited_amount`,
deposits 5x the base unit at a non-trivial leaf index (5, padded with
five zero-commitment dummy deposits at indices 0–4 to match the tree
shape the real proof was generated against), then asserts the recipient
receives 99% of the *actual* 5x amount — not 99% of a flat 1x base unit.
This test would have caught the original bug had it existed beforehand.

The fix was then verified end-to-end on testnet: a real 20 XLM deposit
(20x base unit) was claimed, and the resulting transaction showed
`transfer(..., 19800000)` (99% of 20 XLM) to the recipient and
`AccumulatedFee` increasing by `2000000` (1% of 20 XLM) — confirmed via
direct inspection of the transaction's emitted events and state changes
on [Stellar Expert](https://stellar.expert/explorer/testnet), not merely
trusted from the client UI.

### What this means for the trusted setup

Because the circuit's R1CS changed (a new public output adds new
constraints), the V3 circuit's existing proving/verification key could
not simply be reused — a new phase-2 Groth16 setup was required for
V3.1, following the same process and the same caveats as the original
V3 setup (see [Trusted Setup](#trusted-setup) below): the same reused
Powers of Tau file, followed by a new local phase-2 contribution
specific to the V3.1 circuit. All prior caveats about this not being a
publicly-coordinated MPC ceremony apply equally to V3.1.


## Private Note Encryption (Phase 3)

This section documents the end-to-end encryption system added on top of
the existing ZK privacy pool: private notes (the `secret`/`nullifier`/
`recipientHash` bundle needed to claim a tip) are now encrypted before
being shared via a URL or QR code, rather than transmitted as plaintext
JSON as in earlier iterations of this project.

### Why this couldn't simply use the creator's existing Stellar key

The natural-seeming approach — derive an encryption keypair from the
creator's existing Stellar (Ed25519) identity — was considered and
rejected for a concrete, verified reason: Freighter (the only wallet
this project integrates with) exposes only a `submitMessage()` (signing)
function in its public API, never the raw private key, and has no
`decrypt()` or shared-secret-derivation method at all. Ed25519 keys
*can* be mathematically converted to X25519 keys usable for ECDH
encryption, but that conversion requires the raw private key, which a
non-custodial wallet extension never exposes to a dApp by design. This
ruled out Stellar-key-derived encryption as a starting point, not as a
preference — it confirmed there was no implementation path with
Freighter as-is.

The system therefore uses a **separate** X25519 keypair, generated and
managed entirely client-side, independent of the Stellar identity.

### Key lifecycle: the extractable/non-extractable/backup tension

A non-extractable Web Crypto `CryptoKey` cannot be exported in any
form — which is good for protecting it from casual extraction during
normal use, but directly conflicts with the requirement to back it up.
The resolution used here, a standard pattern in crypto wallets:

1. The keypair is generated as **extractable**, exactly once
2. The raw private key bytes are immediately wrapped (AES-GCM
   encrypted) under a key derived from the creator's password —
   **and, independently, a second time** under a key derived from a
   12-word recovery phrase (`@scure/bip39`, an audited library).
   Either secret alone is sufficient to unlock later; this is an "OR
   gate," not a single derivation path with a fallback bolted on
3. Both wrapped copies are persisted in IndexedDB. The plaintext
   extractable key material is never written anywhere and is dropped
   from memory immediately after wrapping
4. For actual day-to-day use, the key is re-imported as
   **non-extractable** from the unwrapped bytes, and held only in an
   in-memory session (auto-locked after 15 minutes of inactivity)

IndexedDB therefore never stores a `CryptoKey` object in any form — only
opaque, AES-GCM-wrapped bytes. This sidesteps a real, verified
historical inconsistency across browsers in how non-extractable EC
`CryptoKey` objects survive structured-clone storage in IndexedDB,
without needing to rely on that behavior being correct.

### Key derivation parameters

Argon2id via `hash-wasm`, run inside a dedicated Web Worker (not the
main thread, which would otherwise visibly freeze the UI during
unlock): `time=3, memory=64MB, parallelism=1, hashLength=32`.
`parallelism=1` is an honest reflection of what browser WASM Argon2
implementations actually compute, not an inflated number — claiming
higher parallelism without it being real would be a false sense of
security rather than an actual one.

### Threat model specific to this system

* **XSS during an unlocked session.** A non-extractable key prevents an
  XSS payload from *exfiltrating* raw key bytes, but does not prevent
  it from *using* the key (e.g. calling `decrypt()` through the
  existing in-memory handle) for as long as the session stays unlocked.
  The primary defense against this is a strict Content-Security-Policy
  (see [apps/web/README.md](apps/web/README.md#content-security-policy))
  restricting script sources to `'self'`; the non-extractable key and
  15-minute auto-lock are defense-in-depth on top of that, not the
  primary control.
* **Recovery phrase or backup file compromise.** Anyone who obtains the
  12-word recovery phrase, or the encrypted backup file *and* the
  password, can decrypt all of a creator's past and future private
  notes. This is the same trust model as a cryptocurrency wallet seed
  phrase, and is disclosed to the creator explicitly during setup, with
  a "write it down, do not screenshot" instruction matching standard
  wallet UX conventions.
* **Lost password and lost recovery phrase and lost backup file,
  simultaneously.** Total, permanent loss of access to all past private
  notes. There is no server-side recovery path — this is a deliberate
  consequence of the zero-backend design, not an oversight. A *hybrid*
  recovery option (storing the wrapped key on-chain, retrievable from
  any device with just the password) was explicitly considered and
  rejected for the initial release: it would make encrypted key material
  permanently public, conflicting with this project's minimal-on-chain-data
  philosophy, in exchange for convenience that can instead be addressed
  with better backup UX. Tracked as a possible future addition, pending
  real usage data on how often creators actually lose backups.
* **Device-with-active-malware while a session is unlocked.** No
  client-side-only system can fully defend against this; auto-lock
  limits the exposure window but cannot eliminate it.

### Premium gating and its CSP cost

Private notes are a paid, opt-in feature
(`growthip-creator-registry`, 6 XLM one-time activation) and are
**mandatory, not optional**, for a given creator once enabled — a
supporter cannot tip a creator who has not activated encryption at all
(no silent plaintext fallback). Enabling this feature in the browser
required two CSP adjustments beyond a typical "strict" policy, both
found only through actual runtime testing rather than predicted in
advance: `'wasm-unsafe-eval'` for `hash-wasm`'s WebAssembly compilation
inside the Argon2id worker, and replacing a `new Function(module,
exports, src)` pattern (functionally identical to `eval()`) used to
load the circom-generated `witness_calculator.js` with real `<script>`
tag injection instead, which `'self'` permits without needing the
broader `'unsafe-eval'`. See
[apps/web/README.md](apps/web/README.md#content-security-policy) for
the full CSP configuration and reasoning.


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
is listed explicitly under Phase 4 (Production Hardening) in the project [Roadmap](README.md#roadmap).

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
* **Private note encryption is opt-in and paid.** End-to-end encrypted
  note delivery exists (see
  [Private Note Encryption](#private-note-encryption-phase-3) above) but
  requires the creator to activate it (6 XLM one-time). Once activated
  it is mandatory for that creator going forward -- there is no
  plaintext fallback -- but a creator who never activates it cannot
  receive tips at all, rather than receiving them with weaker privacy.
* **No hybrid on-chain key recovery.** Forgetting both the password and
  the recovery phrase (and not having a backup file) means permanent
  loss of access to past private notes, with no server-side recovery
  path. See the encryption section above for why this trade-off was
  chosen deliberately over storing recoverable key material on-chain.
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