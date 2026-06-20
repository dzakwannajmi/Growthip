# Growthip 🌱
### Privacy-Preserving Creator Tipping on Stellar

> *Support creators without exposing the relationship.*

Growthip is a privacy-preserving creator tipping protocol built on **Stellar Soroban**, using **Groth16 zero-knowledge proofs** with **native BN254 verification** enabled by Stellar Protocol 25 (X-Ray) and Protocol 26 (Yardstick).

A supporter deposits a fixed-denomination tip into a shared pool. The creator later claims it using a ZK proof. The public chain records both events — but cannot trivially link which deposit corresponds to which claim.

```text
supporter deposits → pool stores commitment → on-chain root updates
creator claims     → ZK proof verifies note membership + deposit amount
nullifier consumed → double-claim prevented forever
```

> ⚠️ Hackathon prototype. Stellar Testnet only. Not audited. Do not use with real funds.

---

## Table of Contents

- [Live Demo](#live-demo)
- [Why Growthip](#why-growthip)
- [Prior Art and How Growthip Differs](#prior-art-and-how-growthip-differs)
- [What Makes Growthip Novel on Stellar](#what-makes-growthip-novel-on-stellar)
- [Testnet Deployment](#testnet-deployment)
- [Protocol Design](#protocol-design)
- [Creator Links & Sharing](#creator-links--sharing)
- [Security History (Honest Disclosure)](#security-history-honest-disclosure)
- [Fee Model](#fee-model)
- [ZK Circuit](#zk-circuit)
- [Soroban Contracts](#soroban-contracts)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Responsible Privacy](#responsible-privacy)
- [Roadmap](#roadmap)
- [Prototype Notice](#prototype-notice)
- [License](#license)

---

## Live Demo
* **URL:** [https://growthip.vercel.app](https://growthip.vercel.app)
* **Network:** Stellar Testnet
* **Wallet:** Freighter

---

## Why Growthip

On every public blockchain, every payment is permanent and visible:

```text
supporter wallet → creator wallet → amount → timestamp
```

For creators and supporters, this creates real friction:

* A donor cannot support a controversial creator without public association
* An open-source maintainer cannot receive donations without exposing income
* A student builder cannot accept community support without family judgment
* A community admin cannot reward contributors without triggering social dynamics

Growthip solves this with a ZK privacy pool: supporters deposit into a shared pool, share a private note off-chain, and creators claim using a zero-knowledge proof. The on-chain link between supporter and creator is cryptographically broken.

**This is not a mixer.** Growthip is an application-specific tipping protocol for creator support, with fixed small denominations, recipient registration, and honest compliance framing.

---

## Prior Art and How Growthip Differs

Growthip builds on the Stellar ecosystem's open privacy primitives.
Two key references exist:

**SDF soroban-examples/privacy-pools** — the official SDF research prototype
using Soroban pool contracts, Circom Groth16 (BLS12-381), and Merkle tree
membership proofs with Association Set Providers (ASPs) for compliance.

**NethermindEth/stellar-private-payments** — SDF-promoted proof-of-concept
by Nethermind, adding private in-pool transfers, browser WASM proving,
and UTXO-style note semantics.

Growthip acknowledges both as architectural predecessors and extends the
foundation with concrete improvements:

1. **Native BN254 (Protocol 25/26)** instead of BLS12-381 — lower on-chain
   verification cost using Stellar's newest host functions
2. **V3 circuit recipient binding** — `commitment = Poseidon(secret, nullifier, recipientHash)`
   binds the recipient at circuit level, not just contract level, preventing
   recipient substitution even if the note is stolen
3. **V3.1 circuit deposit-amount binding** — the circuit additionally exposes
   the deposit's Merkle leaf `index` as a public output (derived from the
   existing path bits, no new private inputs), letting the pool pay out the
   *actual* amount deposited (1x/5x/10x/20x the base unit) instead of a flat
   base unit — see [Security History](#security-history-honest-disclosure)
   for how a real bug here was found and fixed
4. **Private deposit()** — prevents free commitment spam (griefing vector
   present in both reference implementations)
5. **On-chain trustless root history** — the Merkle root is recomputed
   on-chain via the native Poseidon host function on every deposit, and
   claims are validated against a bounded on-chain root history. No admin
   ever sets or signs off on the root
6. **pool upgrade()** — enables protocol upgrades without losing state,
   absent in both reference implementations

Application focus: while both references are general-purpose, Growthip
applies the pattern specifically to creator tipping, with a full Freighter
E2E flow, shareable creator tip links, public/private donor messages, QR
code sharing, 31 passing tests, and a working testnet deployment.

## What Makes Growthip Novel on Stellar

Growthip is the first application on Stellar to:
* ✅ Deploy a native Groth16 BN254 verifier using Protocol 25/26 host functions
* ✅ Implement an on-chain Poseidon-based Merkle tree — root computed natively
  on-chain via the `poseidon_permutation` host function, not just verified
  off-chain
* ✅ Demonstrate ZK Merkle membership proof in a working creator tipping flow
* ✅ Show a complete deposit → note → proof → claim cycle on Stellar Testnet
* ✅ Use `recipientHash` binding at circuit level (V3) — not just contract level
* ✅ Expose a ZK-circuit-derived deposit index (V3.1) so claims pay out the
  actual amount deposited, while keeping the depositor's identity private

CAP-0075: Cryptographic Primitives for Poseidon/Poseidon2 Hash Functions defines host functions that expose the core permutation primitives behind Poseidon and Poseidon2, addressing a key performance bottleneck for hashing inside ZK-friendly applications, shipped in Protocol 25 (X-Ray). CAP-0080 in Protocol 26 (Yardstick) builds on the BN254 work from X-Ray, adding nine new host functions for BN254 multi-scalar multiplication, scalar-field arithmetic, and curve-membership checks. Growthip uses the Poseidon host function directly to compute its Merkle root on-chain — not just to verify a Groth16 proof, but to eliminate the need for any admin-submitted root entirely.

---

## Testnet Deployment

### V3.1 Contracts — Current, deployed with `soroban-sdk 26.0.1`

| Contract | Address |
|---|---|
| Growthip Merkle Verifier V3.1 | `CA5IHK2NAUVQ6NLS7CWSGPZWEXY6CAFAQBLMM43GCKSFYC2BZXZQIA2L` |
| Growthip Pool — XLM | `CDAI6HSTK22CYJQPJ6NWX6QCKPX37WVJRFPA3A6FNM2EPQI5GBLH5ZJ3` |
| Growthip Pool — USDC | `CBKTJKSGQ7Y4WOLM6PQWNKHTHMYQ2MBWPZJYCH3KNZPK7SERD5ZGAXK7` |
| Native XLM Token (SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC Token (SAC) | `CA2R3TBJRDGPAPIXZXVBAZDD63Q5HLJF7JFOLIPBABMDMWJAJ6AV7ZUY` |
| Admin / Treasury | `GDPAPDZWAKBXUPCNMI4YHAZ7DS7UOUTPGXAFDSWZG4URRMWHFSQTDQBM` |
| Tip Amount — XLM pool | `10,000,000 stroops = 1 XLM` (base; 5x/10x/20x also accepted) |
| Tip Amount — USDC pool | `1,000,000 stroops = 0.1 USDC` (base; 5x/10x/20x also accepted) |
| Network | Stellar Testnet |

> Contracts have been redeployed twice from earlier versions, after two
> self-discovered issues were found and fixed — a root-validation
> vulnerability, and a deposit-amount payout bug. See
> [Security History](#security-history-honest-disclosure) below for both.

---

## Protocol Design

### Privacy Model

Growthip implements a **fixed-denomination privacy pool** model:

1. **Supporter calls `deposit_paid(commitment, amount, message?)`**
   * → tip locked in pool (1x/5x/10x/20x base denomination)
   * → commitment stored on-chain (anonymous — no identity link)
   * → an optional public message (max 50 bytes) may be attached, stored
     on-chain, and is never linked to the depositor's wallet address
   * → **the pool recomputes its Merkle root on-chain**, using the native
     Poseidon host function, and appends the new root to an on-chain
     bounded root history
2. **Supporter shares private note off-chain with creator**
   * → note contains: `secret`, `nullifier`, `recipientHash`, Merkle path
   * → can be shared via copy/paste, file download, or as a QR code the
     creator scans directly
3. **Creator calls `register_recipient(recipient, recipient_hash)`**
   * → binds their wallet to their expected `recipientHash`
   * → done automatically the first time a creator connects their wallet
     to the dashboard, on every available token pool
4. **Creator generates Groth16 proof from private note (browser-side)**
   * → proof proves: valid note + Merkle membership + unused nullifier +
     the deposit's leaf index (V3.1)
5. **Creator calls `claim_to(recipient, proof_bytes, public_inputs)`**
   * → contract verifies, in order: **root is present in on-chain root
     history** → nullifier unused → proof valid → recipient hash match
   * → looks up the deposit's *actual* amount via the proof's index output
   * → 99% of that actual tip amount transferred to creator, 1% accrues
     as platform fee (see [Fee Model](#fee-model))
   * → nullifier marked as used (forever)

### What Is Public
* ✅ Deposit timestamps
* ✅ Withdrawal timestamps
* ✅ Pool balance
* ✅ Total deposits / total claims
* ✅ Commitment list (anonymous — not linked to identity)
* ✅ Used nullifier list (anonymous — not linked to secret)
* ✅ Root history (anonymous — just a list of hashes, not linked to depositors)
* ✅ A deposit's optional public message, if the supporter chose to attach one

### What Is Protected
* 🔒 Link between supporter wallet and creator wallet
* 🔒 Tip amount granularity (within a fixed denomination tier — all deposits
  at a given tier are identical)
* 🔒 Secret and nullifier preimage (never leave the browser)

### Known Limitations
* ⚠️ Deposit and withdrawal timestamps are public — timing correlation is possible
* ⚠️ Small anonymity set on testnet (max 8 leaves per Merkle tree) — privacy
  improves with more participants and larger trees
* ⚠️ Note delivery is off-chain and not encrypted by Growthip
* ⚠️ Platform fee withdrawal (`withdraw_fees`) is a batch operation,
  deliberately disconnected in time from any individual claim to avoid
  linking a specific claim to a treasury-incoming transfer — but the
  treasury address itself is public, so aggregate fee revenue is observable
* ⚠️ A creator's real wallet address is unavoidably revealed on-chain the
  moment they claim — the cosmetic tip-link obfuscation (see
  [Creator Links & Sharing](#creator-links--sharing)) only avoids exposing
  the raw address in a casually-shared URL, it is not cryptographic privacy
* ⚠️ Receiving USDC (or any non-native asset) requires the creator's wallet
  to already have an open Stellar trustline to that asset — this is a
  Stellar-level requirement, not something Growthip can bypass
* ⚠️ Not audited — do not use with real funds

---

## Creator Links & Sharing

Every connected wallet gets a personal, shareable tip page at
`growthip.vercel.app/tip/<id>`, where `<id>` is the creator's Stellar
address transformed with a reversible base62 encoding
(`apps/web/src/lib/addressId.ts`).

**This is cosmetic obfuscation, not cryptographic privacy.** The transform
is publicly computable in both directions — anyone opening the link can
decode it back to the real address, because the supporter's browser needs
to know where to send the tip. Its only purpose is avoiding a raw
56-character Stellar address sitting in a casually-shared URL (a Twitter
bio, a stream overlay, a Discord pin). The creator's real address is still
fully visible on-chain the instant they call `register_recipient()` or
`claim_to()` — this does not and cannot hide that.

The dashboard's "Personal Link" card provides:
* A working copy-link button (no hardcoded placeholder)
* A QR code rendering of the same link, for sharing on a stream or printed
  material
* A native Web Share API trigger on supported devices/browsers
* A direct "open in new tab" link to preview the public page

The public tip page (`apps/web/src/app/tip/[id]/page.tsx`) lets a
supporter, without ever creating an account: connect Freighter, pick a
token and preset amount, optionally attach a public on-chain message (max
50 characters), deposit, and receive/share their resulting private note —
including as a QR code the creator can scan directly, skipping manual
copy-paste entirely.

---

## Security History (Honest Disclosure)

This section exists because Growthip's design changed materially during
development, and we believe documenting *why* is more credible than
pretending the final design was always the plan. Full technical writeups,
including exact attack steps and on-chain transaction evidence, are in
[SECURITY.md](SECURITY.md).

### Issue #1 — Root Forgery (Critical, fixed)

An earlier iteration of the pool contract removed its root-validation check
under the incorrect assumption that "proof validity IS the root check." A
Groth16 proof only proves *"I know a path to root X"* — it does **not**
prove that root X is one this pool ever actually produced. An attacker
could build an entirely fake Merkle tree offline and drain real deposits
without ever making one.

**Fix:** the pool now recomputes its Merkle root on-chain (via the native
Poseidon host function) after every deposit, and validates a claim's proof
root against a bounded on-chain history before doing anything else —
verified against the frontend's own Merkle/Poseidon implementations with
dedicated parity tests, not just assumed correct.

### Issue #2 — Verifier Interface Leak (Low severity, fixed)

`growthip-pool` depended on the verifier as a full Rust crate rather than
calling it purely through its on-chain address, which caused the
verifier's own `verify()` function to be statically linked into and
exposed through the pool's compiled WASM — confirmed directly via
`stellar contract info interface`.

**Fix:** replaced the full-crate dependency with a minimal, locally
declared client trait carrying only the function signature needed for
cross-contract calls. Pool WASM size dropped ~15% and `verify()` no longer
appears in the pool's exported interface.

### Issue #3 — Deposit-Amount-Aware Claims (Critical, fixed)

`claim_to()` always paid out a flat base-unit amount regardless of how
much was actually deposited (1x/5x/10x/20x). A 20 XLM tip resulted in the
creator receiving only 0.99 XLM, with the remaining ~19 XLM permanently
locked in the pool — there was no function that could move it out. This
was discovered through a real testnet transaction, not code review.

**Fix:** the V3.1 circuit adds `index` (the deposit's Merkle leaf
position) as a new public output, derived from path bits the circuit
already computed — no new private inputs, no loss of depositor anonymity.
`claim_to()` now looks up the actual deposited amount at that index and
pays out 99% of the *real* amount. Verified both with a dedicated
regression test (5x deposit, non-trivial leaf index) and, after
deployment, against a live 20 XLM testnet transaction showing the correct
19.8 XLM payout and 0.2 XLM fee accrual.

While fixing this, a related bug was also found: the public-input length
check had been updated in `claim()` but an identical, separate check
inside `claim_to()` was missed, silently causing every claim to fail —
caught through systematic isolation debugging rather than guessing.

---

## Fee Model

Growthip charges a **1% platform fee**, taken at claim time, calculated
against the **actual amount deposited** (not a flat base unit — see
[Security History, Issue #3](#security-history-honest-disclosure)):

* Recipient receives **99%** of the actual tip amount, transferred
  immediately on a successful `claim_to()` call
* The remaining **1%** accrues in the pool contract's storage
  (`accumulated_fees()`), **not** transferred out immediately
* The treasury withdraws accumulated fees via an admin-gated
  `withdraw_fees()` call, at any time, independent of any individual
  claim — this is a deliberate privacy choice: it avoids creating an
  on-chain link between *"who just claimed"* and *"when did the treasury
  receive a transfer"*

```rust
pub fn claim_to(...) -> bool { ... }          // 99% to recipient, 1% accrues
pub fn withdraw_fees(admin) -> i128;          // admin-gated batch withdrawal
pub fn accumulated_fees() -> i128;            // public read, for transparency
```

This fee funds ongoing maintenance, infrastructure, and feature
development. It is disclosed transparently in the claim UI before the user
confirms a withdrawal.

---

## ZK Circuit

### V3.1 Circuit (Current) — `circuits/growthip_merkle_note_v3_1.circom`

V3.1 builds on V3's recipient binding by adding a fourth public output,
`index`, so the pool contract can pay out the actual deposited amount
instead of a flat base unit (see
[Security History, Issue #3](#security-history-honest-disclosure)).

```text
commitment = Poseidon(secret, nullifier, recipientHash)  ← V3: bound here
nullifierHash = Poseidon(nullifier)
recipientHashOut = recipientHash  (public output for on-chain check)
index = Σ pathIndices[i] * 2^i    ← V3.1: leaf position, NEW public output

Merkle membership: commitment ∈ MerkleTree(root)
Binary constraint: pathIndices[i] ∈ {0, 1}
```

`index` is derived entirely from the `pathIndices[]` bits the circuit
already computed to prove Merkle membership — no new private inputs. It
reveals only the deposit's position in a small (max 8-leaf) tree, which is
no more sensitive than the commitment list itself, already fully public
on-chain.

**Public inputs** (visible on-chain):
* `root` — validated against on-chain root history
* `nullifierHash` — Poseidon(nullifier), for double-claim prevention
* `recipientHash` — bound recipient, for front-running prevention
* `index` — Merkle leaf position, used to look up the actual deposited amount

**Private inputs** (never leave the browser):
* `secret`
* `nullifier`
* `recipientHash` (private — bound inside commitment)
* `pathElements[3]`
* `pathIndices[3]`

**What the proof guarantees:**
* Prover knows `(secret, nullifier, recipientHash)` that hash to a commitment in the tree
* `nullifierHash` is correctly derived from the same nullifier
* The claim is bound to a specific `recipientHash` — cannot be redirected
* The commitment has not been claimed before (enforced by nullifier on-chain)
* The root itself is one the pool actually produced (enforced by the
  on-chain root-history check, not by the proof alone)
* `index` matches the actual Merkle path proven — cannot be forged to
  claim a different deposit's amount

### Trusted Setup

The V3.1 circuit's Groth16 proving/verification keys were generated using
**snarkjs's standard Powers of Tau ceremony** (the publicly available,
widely-reused `ptau` files from the Hermez/Polygon ceremony), reused from
the original V3 setup, followed by a new circuit-specific phase-2
contribution (V3.1's R1CS differs from V3's, so its proving/verification
key could not simply be carried over). This is the same trusted-setup
pattern used by most hackathon and early-stage Groth16 deployments; it is
**not** a multi-party, audited ceremony, and should not be treated as one.
A production deployment would require a dedicated, publicly-verifiable
phase-2 MPC ceremony before handling real funds.

### Circuit Evolution

| Version | Commitment | Recipient Binding | Deposit-Amount Aware | Status |
|---|---|---|---|---|
| V1 (square) | N/A | N/A | N/A | Verifier pipeline test |
| V2 (note) | `Poseidon(secret, nullifier)` | Contract-level only | No | Deprecated |
| V3 | `Poseidon(secret, nullifier, recipientHash)` | **Circuit-level** | No | Deprecated |
| V3.1 (current) | `Poseidon(secret, nullifier, recipientHash)` | **Circuit-level** | **Yes** | ✅ Active |

---

## Soroban Contracts

### GrowthipPool

Main escrow and claim contract. Deployed twice — one instance per token
(XLM, USDC) — sharing the same WASM binary, each with its own storage and
its own fixed denomination.

```rust
initialize(admin, verifier, root, tip_amount, treasury)  // one-time setup
set_token(admin, token_addr)            // set token SAC (blocked after deposits)
update_verifier(admin, new_verifier)    // upgrade verifier without losing state
upgrade(admin, new_wasm_hash)           // upgrade pool WASM (admin only)
update_root(admin, new_root)            // legacy/manual root display only —
                                         // NOT used for claim validation
register_recipient(recipient, hash)     // bind wallet to recipientHash
deposit_paid(depositor, commitment, amount, message?)  // lock tip, store
                                                        // commitment + optional
                                                        // public message,
                                                        // recompute root on-chain
claim_to(recipient, proof, inputs)      // verify root + proof + index, release
                                         // 99% of the ACTUAL deposited amount,
                                         // accrue 1% fee
withdraw_fees(admin)                    // admin-gated batch fee withdrawal
accumulated_fees()                      // public read of pending fee balance
get_message(index)                      // public read of a deposit's optional message
is_nullifier_used(nullifier_hash)       // check double-claim status
```

**Security properties:**
* ✅ `initialize`: double-call protected
* ✅ `set_token`: admin-only, blocked after first deposit
* ✅ `update_verifier`: admin-only, enables protocol upgrades
* ✅ `upgrade`: admin-only, uses Soroban deployer
* ✅ `claim_to`/`claim`: **root validated against on-chain history first**
  (fail-fast, before the Groth16 pairing check) → nullifier check → proof
  verify → recipient check → actual-amount lookup → transfer
* ✅ `register_recipient`: recipient must sign
* ✅ `deposit_paid`: depositor must sign + amount must be 1x/5x/10x/20x the
  pool's fixed denomination + optional message capped at 50 bytes
* ✅ nullifier consumed only after all checks pass (Soroban atomicity)
* ✅ wrong recipient does not consume nullifier
* ✅ wrong/forged root does not consume nullifier and is rejected before
  any pairing check runs
* ✅ a claim's payout is bound to its proof's `index` output — cannot be
  redirected to drain a different deposit's amount
* ✅ `deposit_internal()` is private — free commitment spam prevented
* ✅ privacy-safe events: deposit index only, claim nullifier hash only
  (no addresses), defined via the SDK's typed `#[contractevent]` macro
* ✅ verifier called through a minimal local client trait — the verifier's
  own contract interface is not bundled into or exposed through the pool's
  WASM

### GrowthipMerkleVerifierV3.1

Native Soroban Groth16 verifier using Protocol 25/26 BN254 host functions.

`verify(proof_bytes, public_inputs) -> bool`

**Verification steps:**
1. Deserialize proof bytes → `(G1 A, G2 B, G1 C)`
2. Load hardcoded verifying key (compiled at build time from `parameters.json`)
3. Compute `vk_x = IC[0] + MSM(IC[1..], public_inputs)`  [Protocol 26: BN254 multi-scalar multiplication, CAP-0080]
4. Pairing check: `e(A,B) == e(α,β) · e(vk_x,γ) · e(C,δ)`  [Protocol 25: BN254 pairing, CAP-0074]
5. Return pairing result

### Test Coverage

```bash
cargo test --workspace
```

```text
growthip-merkle-verifier      : 1 passed
growthip-note-verifier        : 1 passed
growthip-merkle-verifier-v2   : 1 passed
growthip-merkle-verifier-v3   : 3 passed   (legacy, kept for reference)
growthip-merkle-verifier-v3-1 : 3 passed   (active, 4-public-input circuit)
square-verifier                : 1 passed

growthip-pool                  : 21 passed, 3 ignored (documented)
  poseidon_t2_matches_circomlibjs_ground_truth     <- Poseidon parity, t=2
  poseidon_t3_matches_circomlibjs_ground_truth     <- Poseidon parity, t=3
  poseidon_t4_matches_circomlibjs_ground_truth     <- Poseidon parity, t=4
  merkle_root_matches_typescript_ground_truth      <- on-chain root = frontend root
  merkle_root_empty_pool_matches_all_zero_leaves
  test_claim_rejects_wrong_root
  test_claim_to_with_v3_1_verifier_pays_actual_deposited_amount
    <- deposits 5x base unit at a non-trivial leaf index, asserts the
       recipient receives 99% of the REAL amount, not a flat base unit
  test_claim_to_before_recipient_registered_returns_false
  test_invalid_proof_does_not_consume_nullifier
  test_initialize_twice_panics
  test_malformed_public_inputs_length_returns_false
  test_set_token_unauthorized_panics
  test_tampered_public_inputs_rejected
  test_update_root_unauthorized_panics
  test_update_verifier_works
  test_deposit_stores_commitment
  test_wrong_root_does_not_consume_nullifier
  test_set_token_blocked_after_deposits
  deposit_with_message_stores_and_reads_back
  deposit_without_message_returns_none
  deposit_with_oversized_message_panics
  [ignored] test_claim_to_rejects_wrong_recipient_hash  <- outdated V2 fixture, see test comment
  [ignored] test_claim_valid_proof_once_only            <- outdated V2 fixture, see test comment
  [ignored] test_paid_deposit_and_claim_to_recipient    <- outdated V2 fixture, see test comment

Total: 31 passed, 0 failed, 3 ignored (across all workspace crates)
```

The three ignored tests predate the root-history fix and relied on the
absence of root validation to pass — each carries an `#[ignore = "..."]`
reason explaining exactly why, rather than being silently deleted. See
[SECURITY.md](SECURITY.md).

---

## Project Structure

```text
growthip/
├── apps/
│   └── web/                              # Next.js 16 frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── (main)/page.tsx       # Landing page
│       │   │   ├── tip/[id]/page.tsx     # Public creator tip page
│       │   │   └── dashboard/            # Dashboard: send, claim, analytics
│       │   ├── components/
│       │   │   ├── WalletModal.tsx       # Freighter / xBull / Albedo selector
│       │   │   ├── TokenSelector.tsx
│       │   │   ├── AmountSelector.tsx
│       │   │   └── DashboardStats.tsx
│       │   └── lib/
│       │       ├── config.ts             # Centralized env config
│       │       ├── poseidon.ts           # Browser Poseidon (circomlibjs)
│       │       ├── merkle.ts             # Browser Merkle tree reconstruction
│       │       ├── zkp.ts                # Proof generation (V3.1: 4 public inputs)
│       │       ├── addressId.ts          # Cosmetic tip-link address obfuscation
│       │       ├── useMarket.ts          # Live price + balance hooks
│       │       └── growthipPoolClient.ts # Generated TS binding
│       ├── public/zkp/                   # Circuit WASM, .zkey, witness calculator
│       └── .env.local                    # Environment (see testnet.env)
├── circuits/
│   ├── square.circom                     # Verifier pipeline test
│   ├── growthip_note.circom              # V0: commitment + nullifier
│   ├── growthip_merkle_note.circom       # V1: + Merkle proof
│   ├── growthip_merkle_note_v2.circom    # V2: + recipientHash output
│   ├── growthip_merkle_note_v3.circom    # V3: + recipientHash in commitment
│   └── growthip_merkle_note_v3_1.circom  # V3.1: + index public output ✅ active
├── contracts/
│   ├── square-verifier/                  # Pipeline test verifier
│   ├── growthip-note-verifier/           # V0 verifier
│   ├── growthip-merkle-verifier/         # V1 verifier
│   ├── growthip-merkle-verifier-v2/      # V2 verifier (deprecated, dev-only)
│   ├── growthip-merkle-verifier-v3/      # V3 verifier (deprecated, dev-only)
│   ├── growthip-merkle-verifier-v3-1/    # V3.1 verifier ✅ active
│   └── growthip-pool/                    # Pool escrow contract
│       └── src/
│           ├── lib.rs                    # Main contract logic
│           ├── merkle_onchain.rs         # On-chain Merkle root rebuild
│           ├── poseidon_constants_generated.rs  # Extracted circomlib constants
│           ├── poseidon_verify_test.rs   # Poseidon parity tests
│           └── merkle_verify_test.rs     # Merkle root parity tests
├── scripts/
│   ├── make_growthip_merkle_input_v3.js  # Generate V3 input
│   ├── make_v3_1_test_input.js           # Generate V3.1 test input (non-trivial leaf)
│   ├── extract_poseidon.js               # Extract circomlib constants -> Rust
│   ├── convert_growthip_merkle_note_v3_snarkjs.js    # V3 proof -> Soroban format
│   ├── convert_growthip_merkle_note_v3_1_snarkjs.js  # V3.1 proof -> Soroban format
│   └── convert_vk_to_parameters.js       # snarkjs VK -> verifier parameters.json
├── packages/
│   └── growthip-pool-client/             # Generated TypeScript binding
└── testnet.env                           # Testnet contract addresses (reference only)
```

---

## Local Development

### Requirements
* Node.js 18+
* Rust + cargo
* Stellar CLI 26+
* Freighter Wallet (browser extension)
* circom 2.1.6+
* snarkjs

### Setup

```bash
git clone https://github.com/dzakwannajmi/Growthip
cd growthip

npm install

cp apps/web/.env.example apps/web/.env.local
# Fill in contract addresses from testnet.env
```

### Run Frontend

```bash
cd apps/web
npm run dev
# Open http://localhost:3000
```

### Run Tests

```bash
cargo test --workspace
```

### Build Contracts

```bash
stellar contract build
```

### Generate a Fresh V3.1 Proof

```bash
node scripts/make_v3_1_test_input.js

node circuits/build/growthip_merkle_note_v3_1_js/generate_witness.js \
  circuits/build/growthip_merkle_note_v3_1_js/growthip_merkle_note_v3_1.wasm \
  circuits/growthip_merkle_note_v3_1_input.json \
  circuits/build/growthip_merkle_note_v3_1_witness.wtns

snarkjs groth16 prove \
  circuits/build/growthip_merkle_note_v3_1_final.zkey \
  circuits/build/growthip_merkle_note_v3_1_witness.wtns \
  circuits/build/growthip_merkle_note_v3_1_proof.json \
  circuits/build/growthip_merkle_note_v3_1_public.json

snarkjs groth16 verify \
  circuits/build/growthip_merkle_note_v3_1_verification_key.json \
  circuits/build/growthip_merkle_note_v3_1_public.json \
  circuits/build/growthip_merkle_note_v3_1_proof.json

node scripts/convert_growthip_merkle_note_v3_1_snarkjs.js
```

---

## Responsible Privacy

Growthip is built for creator support, not for financial opacity.

The pool contract is fully transparent — every deposit and withdrawal is visible on-chain. What Growthip protects is the personal link between supporter and creator, because that relationship should be private by default — just like a tip in a jar does not record your name.

* ✅ Fixed denomination tiers — economically impractical for money laundering
* ✅ Recipient registration required — accountable claim flow
* ✅ Testnet only — no real assets
* ✅ Not a general-purpose mixer — application-specific tipping only
* ✅ All limitations documented honestly, including two self-found and
  self-fixed critical vulnerabilities (root validation, deposit-amount
  payout) — see [SECURITY.md](SECURITY.md)

**Why privacy is legitimate:**
When you tip a street musician, nobody records your name. When you support a creator in person, there is no public ledger. Growthip brings this natural privacy to blockchain-based creator support — without hiding the pool itself, and without compromising auditability of the protocol.

---

## Roadmap

**Phase 1 — Hackathon MVP ✅**
* Native BN254 Groth16 verifier on Soroban (Protocol 25/26)
* V3.1 circuit with cryptographic recipient binding and deposit-amount-aware
  claims
* Pool escrow with nullifier anti-double-claim
* Trustless on-chain Merkle root computation + root-history validation
* 1% platform fee with privacy-preserving batch withdrawal
* Freighter deposit + claim flow
* Testnet E2E working, including live verification of correct payout on
  multi-unit (5x/20x) deposits
* 31 tests passing
* Vercel deployment

**Phase 2 — Creator Profiles & Sharing ✅**
* Shareable, cosmetically-obfuscated creator tip links (`/tip/[id]`)
* QR codes for both tip links and private claim notes
* Optional public on-chain donor messages (max 50 chars)
* Auto-registration of recipient hashes across all token pools on wallet connect

**Phase 3 — Encrypted Note Delivery**
* In-app encrypted note delivery (mechanism TBD — evaluated and rejected
  Stellar `manageData` entries for this due to their 64-byte size limit,
  far smaller than a private note; current direction is client-side
  encryption with the blob carried in the shareable link/QR itself, to
  stay backend-free)
* End-to-end encrypted creator inbox
* Private (creator-only) donor messages, as an alternative to the public
  on-chain message

**Phase 4 — Production Hardening**
* Formal security audit
* Public, multi-party trusted-setup ceremony for the V3.1 circuit
* View key for compliance reporting
* Allowlist / eligibility gate
* Association Set Provider (ASP) integration
* Vault Mode: offline claim signing

**Phase 5 — Creator Platform**
* Premium tier (advanced analytics, API/SDK access)
* Multiple denomination pools
* Web Worker browser proof generation
* Mobile-responsive UI polish

---

## Prototype Notice

Growthip is a hackathon/testnet prototype.

* Not audited
* Not production-ready
* Trusted setup is a standard local snarkjs ceremony, not a
  public multi-party one
* Note delivery is manual (off-chain, not encrypted)
* Small anonymity set on testnet (max 8 leaves per tree)
* Merkle root is NOT admin-controlled — computed on-chain natively
* Honest about all limitations, including two self-found vulnerabilities
  and their fixes (see [SECURITY.md](SECURITY.md))
* Testnet only — no real funds at risk

---

## License

MIT — Muhammad Dzakwan Najmi