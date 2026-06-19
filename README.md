# Growthip 🌱
### Privacy-Preserving Creator Tipping on Stellar

> *Support creators without exposing the relationship.*

Growthip is a privacy-preserving creator tipping protocol built on **Stellar Soroban**, using **Groth16 zero-knowledge proofs** with **native BN254 verification** enabled by Stellar Protocol 25 (X-Ray) and Protocol 26 (Yardstick).

A supporter deposits a fixed-denomination tip into a shared pool. The creator later claims it using a ZK proof. The public chain records both events — but cannot trivially link which deposit corresponds to which claim.

```text
supporter deposits → pool stores commitment → on-chain root updates
creator claims     → ZK proof verifies note membership against root history
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
3. **Private deposit()** — prevents free commitment spam (griefing vector
   present in both reference implementations)
4. **On-chain trustless root history** — the Merkle root is recomputed
   on-chain via the native Poseidon host function on every deposit, and
   claims are validated against a bounded on-chain root history. No admin
   ever sets or signs off on the root (see [Security History](#security-history-honest-disclosure)
   for how this replaced an earlier, less safe design)
5. **pool upgrade()** — enables protocol upgrades without losing state,
   absent in both reference implementations

Application focus: while both references are general-purpose, Growthip
applies the pattern specifically to creator tipping, with a full Freighter
E2E flow, 25 passing tests, and a working testnet deployment.

## What Makes Growthip Novel on Stellar

Growthip is the first application on Stellar to:
* ✅ Deploy a native Groth16 BN254 verifier using Protocol 25/26 host functions
* ✅ Implement an on-chain Poseidon-based Merkle tree — root computed natively
  on-chain via the `poseidon_permutation` host function, not just verified
  off-chain
* ✅ Demonstrate ZK Merkle membership proof in a working creator tipping flow
* ✅ Show a complete deposit → note → proof → claim cycle on Stellar Testnet
* ✅ Use `recipientHash` binding at circuit level (V3) — not just contract level

CAP-0075: Cryptographic Primitives for Poseidon/Poseidon2 Hash Functions defines host functions that expose the core permutation primitives behind Poseidon and Poseidon2, addressing a key performance bottleneck for hashing inside ZK-friendly applications, shipped in Protocol 25 (X-Ray). CAP-0080 in Protocol 26 (Yardstick) builds on the BN254 work from X-Ray, adding nine new host functions for BN254 multi-scalar multiplication, scalar-field arithmetic, and curve-membership checks. Growthip uses the Poseidon host function directly to compute its Merkle root on-chain — not just to verify a Groth16 proof, but to eliminate the need for any admin-submitted root entirely.

---

## Testnet Deployment

### V3 Contracts — Current, deployed with `soroban-sdk 26.0.1`

| Contract | Address |
|---|---|
| Growthip Merkle Verifier V3 | `CDQCYVL5EXPZNB5RW5WHZ565QIXWCJURAYF7UNLPIV3GQYRY4NSG57AU` |
| Growthip Pool — XLM | `CARWGBYE2FRXWGLHL3UH2Y7CPACH3WHFVNCJEIDSJ3VCVCONOMH4TENG` |
| Growthip Pool — USDC | `CBNKY7LVXLALUQBSYB2O5PW44BBIRIQL3BT5M2AGM434ACNYF4S5EJ5I` |
| Native XLM Token (SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC Token (SAC) | `CA2R3TBJRDGPAPIXZXVBAZDD63Q5HLJF7JFOLIPBABMDMWJAJ6AV7ZUY` |
| Admin / Treasury | `GDPAPDZWAKBXUPCNMI4YHAZ7DS7UOUTPGXAFDSWZG4URRMWHFSQTDQBM` |
| Tip Amount — XLM pool | `10,000,000 stroops = 1 XLM` (base; 5x/10x/20x also accepted) |
| Tip Amount — USDC pool | `1,000,000 stroops = 0.1 USDC` (base; 5x/10x/20x also accepted) |
| Network | Stellar Testnet |

> Contracts were redeployed from a prior version after a self-discovered
> root-validation vulnerability was found and fixed — see
> [Security History](#security-history-honest-disclosure) below.

---

## Protocol Design

### Privacy Model

Growthip implements a **fixed-denomination privacy pool** model:

1. **Supporter calls `deposit_paid(commitment, amount)`**
   * → tip locked in pool (1x/5x/10x/20x base denomination)
   * → commitment stored on-chain (anonymous — no identity link)
   * → **the pool recomputes its Merkle root on-chain**, using the native
     Poseidon host function, and appends the new root to an on-chain
     bounded root history
2. **Supporter shares private note off-chain with creator**
   * → note contains: `secret`, `nullifier`, `recipientHash`, Merkle path
3. **Creator calls `register_recipient(recipient, recipient_hash)`**
   * → binds their wallet to their expected `recipientHash`
4. **Creator generates Groth16 proof from private note (browser-side)**
   * → proof proves: valid note + Merkle membership + unused nullifier
5. **Creator calls `claim_to(recipient, proof_bytes, public_inputs)`**
   * → contract verifies, in order: **root is present in on-chain root
     history** → nullifier unused → proof valid → recipient hash match
   * → 99% of the tip transferred to creator, 1% accrues as platform fee
     (see [Fee Model](#fee-model))
   * → nullifier marked as used (forever)

### What Is Public
* ✅ Deposit timestamps
* ✅ Withdrawal timestamps
* ✅ Pool balance
* ✅ Total deposits / total claims
* ✅ Commitment list (anonymous — not linked to identity)
* ✅ Used nullifier list (anonymous — not linked to secret)
* ✅ Root history (anonymous — just a list of hashes, not linked to depositors)

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
* ⚠️ Not audited — do not use with real funds

---

## Security History (Honest Disclosure)

This section exists because Growthip's design changed materially during
development, and we believe documenting *why* is more credible than
pretending the final design was always the plan.

### What happened

An earlier iteration of the pool contract removed its root-validation check
under the (incorrect) assumption that **"proof validity IS the root
check."** This is a real cryptographic misconception worth naming
explicitly: a Groth16 proof only proves *"I know a path to root X"* — it
does **not** prove that root X is one this pool ever actually produced. An
attacker could build an entirely fake Merkle tree offline, generate a
valid proof for *that* tree's root, and drain real deposits without ever
making one.

### How it was found and fixed

The issue was caught during self-review before submission, by re-examining
the `claim()` function's actual on-chain logic rather than trusting prior
summaries of it. The fix:

1. **On-chain Merkle root computation.** Soroban's native
   `poseidon_permutation` host function (Protocol 25, CAP-0075) is called
   directly inside `deposit_internal()` to rebuild the full depth-3 tree
   from all current commitments — no off-chain or admin-submitted root is
   ever trusted.
2. **Root history validation.** `claim()` now checks that the proof's
   `root` public input is present in a bounded on-chain history of recent
   roots (sized to the tree's max leaf count), *before* spending gas on
   the Groth16 pairing check. This also correctly handles the race
   condition where a new deposit lands between proof generation and claim
   submission.
3. **Verified, not assumed, parity with the circuit.** Before this fix
   touched the contract, three things were independently verified with
   passing tests, not just trusted from documentation:
   - The Soroban host function's Poseidon output is byte-for-byte
     identical to `circomlibjs`'s output, across every arity Growthip
     uses (t=2, t=3, t=4) — see `poseidon_verify_test.rs`
   - The on-chain Merkle tree construction (padding, level hashing,
     sibling ordering) produces identical roots to the frontend's
     `merkle.ts`, given the same commitments — see `merkle_verify_test.rs`
   - A regression test (`test_claim_to_with_v3_verifier_and_proof`) deposits
     the *actual* commitment used to generate a real V3 proof artifact
     (not a disconnected dummy value), so the test genuinely exercises the
     deposit → root → claim path end-to-end

### A second issue found in the same review pass

While verifying the verifier-contract dependency, we discovered that
`growthip-pool` had been importing `growthip-merkle-verifier-v2` as a full
Rust crate dependency rather than calling it purely through its on-chain
address. Because that crate carries its own `#[contract]` /
`#[contractimpl]` implementation, the verifier's entire interface
(including its `verify()` function) was being statically linked into and
exposed through the pool's own WASM binary — confirmed via
`stellar contract info interface`, which listed `verify()` as a
directly-callable function on the pool contract itself.

This was fixed by replacing the full-crate import with a minimal,
locally-declared `#[contractclient]` trait containing only the `verify()`
signature needed for cross-contract calls. The fix reduced the pool's
compiled WASM size from 60,057 bytes to 50,975 bytes (~15%) and the
verifier's interface no longer leaks through the pool contract.

### Why this is disclosed here, not hidden

We believe a ZK-technical reviewer who reads the contract source will ask
exactly these questions. Answering them here, with the actual fix and the
tests that prove it, is more credible than a README that simply doesn't
mention the issue ever existed.

---

## Fee Model

Growthip charges a **1% platform fee**, taken at claim time:

* Recipient receives **99%** of the base tip amount, transferred
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

### V3 Circuit (Current) — `circuits/growthip_merkle_note_v3.circom`

**The key improvement in V3:** `recipientHash` is now cryptographically bound inside the commitment. A note generated for `recipientHash_A` cannot produce a valid proof for `recipientHash_B`, even if the attacker knows `secret` and `nullifier`.

```text
commitment = Poseidon(secret, nullifier, recipientHash)  ← V3: bound here
nullifierHash = Poseidon(nullifier)
recipientHashOut = recipientHash  (public output for on-chain check)

Merkle membership: commitment ∈ MerkleTree(root)
Binary constraint: pathIndices[i] ∈ {0, 1}
```

**Public inputs** (visible on-chain):
* `root` — validated against on-chain root history (see [Security History](#security-history-honest-disclosure))
* `nullifierHash` — Poseidon(nullifier), for double-claim prevention
* `recipientHash` — bound recipient, for front-running prevention

**Private inputs** (never leave the browser):
* `secret`
* `nullifier`
* `recipientHash` (private in V3 — bound inside commitment)
* `pathElements[3]`
* `pathIndices[3]`

**What the proof guarantees:**
* Prover knows `(secret, nullifier, recipientHash)` that hash to a commitment in the tree
* `nullifierHash` is correctly derived from the same nullifier
* The claim is bound to a specific `recipientHash` — cannot be redirected
* The commitment has not been claimed before (enforced by nullifier on-chain)
* **The root itself is one the pool actually produced** (enforced by the
  on-chain root-history check, not by the proof alone)

### Trusted Setup

The V3 circuit's Groth16 proving/verification keys were generated using
**snarkjs's standard Powers of Tau ceremony** (the publicly available,
widely-reused `ptau` files from the Hermez/Polygon ceremony), followed by
a circuit-specific phase-2 contribution generated locally during
development. This is the same trusted-setup pattern used by most
hackathon and early-stage Groth16 deployments; it is **not** a
multi-party, audited ceremony, and should not be treated as one. A
production deployment would require a dedicated, publicly-verifiable
phase-2 MPC ceremony before handling real funds.

### Circuit Evolution

| Version | Commitment | Recipient Binding | Status |
|---|---|---|---|
| V1 (square) | N/A | N/A | Verifier pipeline test |
| V2 (note) | `Poseidon(secret, nullifier)` | Contract-level only | Deprecated |
| V3 (current) | `Poseidon(secret, nullifier, recipientHash)` | **Circuit-level** | ✅ Active |

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
deposit_paid(depositor, commitment, amount)  // lock tip, store commitment,
                                              // recompute root on-chain
claim_to(recipient, proof, inputs)      // verify root + proof, release 99%,
                                         // accrue 1% fee
withdraw_fees(admin)                    // admin-gated batch fee withdrawal
accumulated_fees()                      // public read of pending fee balance
is_nullifier_used(nullifier_hash)       // check double-claim status
```

**Security properties:**
* ✅ `initialize`: double-call protected
* ✅ `set_token`: admin-only, blocked after first deposit
* ✅ `update_verifier`: admin-only, enables protocol upgrades
* ✅ `upgrade`: admin-only, uses Soroban deployer
* ✅ `claim_to`/`claim`: **root validated against on-chain history first**
  (fail-fast, before the Groth16 pairing check) → nullifier check → proof
  verify → recipient check → transfer
* ✅ `register_recipient`: recipient must sign
* ✅ `deposit_paid`: depositor must sign + amount must be 1x/5x/10x/20x the
  pool's fixed denomination
* ✅ nullifier consumed only after all checks pass (Soroban atomicity)
* ✅ wrong recipient does not consume nullifier
* ✅ wrong/forged root does not consume nullifier and is rejected before
  any pairing check runs
* ✅ `deposit_internal()` is private — free commitment spam prevented
* ✅ privacy-safe events: deposit index only, claim nullifier hash only
  (no addresses), defined via the SDK's typed `#[contractevent]` macro
* ✅ verifier called through a minimal local client trait — the verifier's
  own contract interface is not bundled into or exposed through the pool's
  WASM (see [Security History](#security-history-honest-disclosure))

### GrowthipMerkleVerifierV3

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
growthip-merkle-verifier-v3   : 3 passed
  test_verify_growthip_merkle_note_v3_proof
  test_v3_wrong_proof_rejected
  test_v3_tampered_public_inputs_rejected

square-verifier                : 1 passed

growthip-pool                  : 18 passed, 3 ignored (documented)
  poseidon_t2_matches_circomlibjs_ground_truth   <- Poseidon parity, t=2
  poseidon_t3_matches_circomlibjs_ground_truth   <- Poseidon parity, t=3
  poseidon_t4_matches_circomlibjs_ground_truth   <- Poseidon parity, t=4
  merkle_root_matches_typescript_ground_truth    <- on-chain root = frontend root
  merkle_root_empty_pool_matches_all_zero_leaves
  test_claim_rejects_wrong_root
  test_claim_to_with_v3_verifier_and_proof       <- real deposit->root->claim, with fee split
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
  [ignored] test_claim_to_rejects_wrong_recipient_hash  <- outdated V2 fixture, see test comment
  [ignored] test_claim_valid_proof_once_only            <- outdated V2 fixture, see test comment
  [ignored] test_paid_deposit_and_claim_to_recipient    <- outdated V2 fixture, see test comment

Total: 25 passed, 0 failed, 3 ignored
```

The three ignored tests predate the root-history fix and relied on the
absence of root validation to pass — each carries an `#[ignore = "..."]`
reason explaining exactly why, rather than being silently deleted. See
[Security History](#security-history-honest-disclosure).

---

## Project Structure

```text
growthip/
├── apps/
│   └── web/                              # Next.js 16 frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── (main)/page.tsx       # Landing page
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
│       │       ├── zkp.ts                # Proof generation
│       │       ├── useMarket.ts          # Live price + balance hooks
│       │       └── growthipPoolClient.ts # Generated TS binding
│       └── .env.local                    # Environment (see testnet.env)
├── circuits/
│   ├── square.circom                     # Verifier pipeline test
│   ├── growthip_note.circom              # V0: commitment + nullifier
│   ├── growthip_merkle_note.circom       # V1: + Merkle proof
│   ├── growthip_merkle_note_v2.circom    # V2: + recipientHash output
│   └── growthip_merkle_note_v3.circom    # V3: + recipientHash in commitment
├── contracts/
│   ├── square-verifier/                  # Pipeline test verifier
│   ├── growthip-note-verifier/           # V0 verifier
│   ├── growthip-merkle-verifier/         # V1 verifier
│   ├── growthip-merkle-verifier-v2/      # V2 verifier (deprecated, dev-only)
│   ├── growthip-merkle-verifier-v3/      # V3 verifier - active
│   └── growthip-pool/                    # Pool escrow contract
│       └── src/
│           ├── lib.rs                    # Main contract logic
│           ├── merkle_onchain.rs         # On-chain Merkle root rebuild
│           ├── poseidon_constants_generated.rs  # Extracted circomlib constants
│           ├── poseidon_verify_test.rs   # Poseidon parity tests
│           └── merkle_verify_test.rs     # Merkle root parity tests
├── scripts/
│   ├── make_growthip_merkle_input_v3.js  # Generate V3 input
│   ├── extract_poseidon.js               # Extract circomlib constants -> Rust
│   └── convert_growthip_merkle_note_v3_snarkjs.js  # Convert to Soroban format
├── packages/
│   └── growthip-pool-client/             # Generated TypeScript binding
└── testnet.env                           # Testnet contract addresses
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

### Generate Fresh V3 Proof

```bash
node scripts/make_growthip_merkle_input_v3.js

node circuits/build/growthip_merkle_note_v3_js/generate_witness.js \
  circuits/build/growthip_merkle_note_v3_js/growthip_merkle_note_v3.wasm \
  circuits/growthip_merkle_note_v3_input.json \
  circuits/build/growthip_merkle_note_v3_witness.wtns

snarkjs groth16 prove \
  circuits/build/growthip_merkle_note_v3_final.zkey \
  circuits/build/growthip_merkle_note_v3_witness.wtns \
  circuits/build/growthip_merkle_note_v3_proof.json \
  circuits/build/growthip_merkle_note_v3_public.json

snarkjs groth16 verify \
  circuits/build/growthip_merkle_note_v3_verification_key.json \
  circuits/build/growthip_merkle_note_v3_public.json \
  circuits/build/growthip_merkle_note_v3_proof.json

node scripts/convert_growthip_merkle_note_v3_snarkjs.js
```

---

## Responsible Privacy

Growthip is built for creator support, not for financial opacity.

The pool contract is fully transparent — every deposit and withdrawal is visible on-chain. What Growthip protects is the personal link between supporter and creator, because that relationship should be private by default — just like a tip in a jar does not record your name.

* ✅ Fixed denomination tiers — economically impractical for money laundering
* ✅ Recipient registration required — accountable claim flow
* ✅ Testnet only — no real assets
* ✅ Not a general-purpose mixer — application-specific tipping only
* ✅ All limitations documented honestly, including a self-found and
  self-fixed root-validation vulnerability

**Why privacy is legitimate:**
When you tip a street musician, nobody records your name. When you support a creator in person, there is no public ledger. Growthip brings this natural privacy to blockchain-based creator support — without hiding the pool itself, and without compromising auditability of the protocol.

---

## Roadmap

**Phase 1 — Hackathon MVP**
* Native BN254 Groth16 verifier on Soroban (Protocol 25/26)
* V3 circuit with cryptographic recipient binding
* Pool escrow with nullifier anti-double-claim
* Trustless on-chain Merkle root computation + root-history validation
* 1% platform fee with privacy-preserving batch withdrawal
* Freighter deposit + claim flow
* Testnet E2E working
* 25 tests passing
* Vercel deployment

**Phase 2 — Note Delivery & UX**
* Encrypted claim note via Stellar Data Entry
* End-to-end encrypted creator inbox
* QR code claim ticket flow

**Phase 3 — Production Hardening**
* Formal security audit
* Public, multi-party trusted-setup ceremony for the V3 circuit
* View key for compliance reporting
* Allowlist / eligibility gate
* Association Set Provider (ASP) integration
* Vault Mode: offline claim signing

**Phase 4 — Creator Platform**
* Creator profile pages
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
* Honest about all limitations, including a self-found vulnerability
  and its fix
* Testnet only — no real funds at risk

---

## License

MIT — Muhammad Dzakwan Najmi