# Growthip 🌱
### Privacy-Preserving Creator Tipping on Stellar

> *Support creators without exposing the relationship.*

Growthip is a privacy-preserving creator tipping protocol built on **Stellar Soroban**, using **Groth16 zero-knowledge proofs** with **native BN254 verification** enabled by Stellar Protocol 25/26.

A supporter deposits a fixed-value tip into a shared pool. The creator later claims it using a ZK proof. The public chain records both events — but cannot trivially link which deposit corresponds to which claim.

```text
supporter deposits → pool stores commitment
creator claims     → ZK proof verifies note membership
nullifier consumed → double-claim prevented forever
```

> ⚠️ Hackathon prototype. Stellar Testnet only. Not audited. Do not use with real funds.

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
foundation with four concrete improvements:

1. **Native BN254 (Protocol 25/26)** instead of BLS12-381 — lower on-chain
   verification cost using Stellar's newest host functions
2. **V3 circuit recipient binding** — `commitment = Poseidon(secret, nullifier, recipientHash)`
   binds the recipient at circuit level, not just contract level, preventing
   recipient substitution even if the note is stolen
3. **Private deposit()** — prevents free commitment spam (griefing vector
   present in both reference implementations)
4. **pool upgrade()** — enables protocol upgrades without losing state,
   absent in both reference implementations

Application focus: while both references are general-purpose, Growthip
applies the pattern specifically to creator tipping, with full Freighter
E2E flow, 23 passing tests, and a working testnet deployment.

## What Makes Growthip Novel on Stellar

Growthip is the first application on Stellar to:
* ✅ Deploy a native Groth16 BN254 verifier using Protocol 25/26 host functions
* ✅ Implement Poseidon-based commitment and nullifier scheme on Soroban
* ✅ Demonstrate ZK Merkle membership proof in a working creator tipping flow
* ✅ Show a complete deposit → note → proof → claim cycle on Stellar Testnet
* ✅ Use `recipientHash` binding at circuit level (V3) — not just contract level

Stellar Protocol 25 (X-Ray) introduced native BN254 elliptic curve operations and Poseidon2 hashing. Protocol 26 (Yardstick) added multi-scalar multiplication. Growthip uses these primitives directly in its Soroban verifier contract, making on-chain Groth16 proof verification economically feasible for the first time on Stellar.

---

## Testnet Deployment

### V3 Contracts (Current)

| Contract | Address |
|---|---|
| Growthip Merkle Verifier V3 | `CD3O37X2FIGAHZSM4KVR7XW72HYZOQ75MJF7IZX4LEA6PCKOHMW3N6D2` |
| Growthip Pool V3 | `CCSYSAWOUWWBAHDLXXBZ4NL7VIXGCHAMYWNZHNUVUQQUMY4TSGC6IV56` |
| Native XLM Token (SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Admin | `GDPAPDZWAKBXUPCNMI4YHAZ7DS7UOUTPGXAFDSWZG4URRMWHFSQTDQBM` |
| Tip Amount | `100,000,000 stroops = 10 XLM` |
| Network | Stellar Testnet |

### V2 Contracts (Deprecated — kept for reference)

| Contract | Address |
|---|---|
| Growthip Merkle Verifier V2 | `CDZWWGYDPXPABB6XX3TJ265ORLQNHZ6W2P5BZUTEK7XUGTSSWAGMB5B4` |
| Growthip Pool V2 | `CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ` |

---

## Protocol Design

### Privacy Model

Growthip implements a **fixed-denomination privacy pool** model:

1. **Supporter calls `deposit_paid(commitment)`**
   * → 10 XLM locked in pool
   * → commitment stored on-chain (anonymous — no identity link)
2. **Supporter shares private note off-chain with creator**
   * → note contains: `secret`, `nullifier`, `recipientHash`, Merkle path
3. **Creator calls `register_recipient(recipient, recipient_hash)`**
   * → binds their wallet to their expected `recipientHash`
4. **Creator generates Groth16 proof from private note (browser-side)**
   * → proof proves: valid note + Merkle membership + unused nullifier
5. **Creator calls `claim_to(recipient, proof_bytes, public_inputs)`**
   * → contract verifies: root match + nullifier unused + proof valid + recipient match
   * → 10 XLM transferred to creator
   * → nullifier marked as used (forever)

### What Is Public
* ✅ Deposit timestamps
* ✅ Withdrawal timestamps
* ✅ Pool balance
* ✅ Total deposits / total claims
* ✅ Commitment list (anonymous — not linked to identity)
* ✅ Used nullifier list (anonymous — not linked to secret)

### What Is Protected
* 🔒 Link between supporter wallet and creator wallet
* 🔒 Tip amount (via fixed denomination — all deposits identical)
* 🔒 Secret and nullifier preimage (never leave the browser)

### Known Limitations
* ⚠️ Deposit and withdrawal timestamps are public — timing correlation is possible
* ⚠️ Small anonymity set on testnet — privacy improves with more participants
* ⚠️ Note delivery is off-chain and not encrypted by Growthip
* ⚠️ Merkle root is admin-controlled (trusted component) — see roadmap
* ⚠️ Not audited — do not use with real funds

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
* `root` — current Merkle root
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

### Circuit Evolution

| Version | Commitment | Recipient Binding | Status |
|---|---|---|---|
| V1 (square) | N/A | N/A | Verifier pipeline test |
| V2 (note) | `Poseidon(secret, nullifier)` | Contract-level only | Deprecated |
| V3 (current) | `Poseidon(secret, nullifier, recipientHash)` | **Circuit-level** | ✅ Active |

---

## Soroban Contracts

### GrowthipPool

Main escrow and claim contract.

```rust
initialize(admin, verifier, root)       // one-time setup
set_token(admin, token_addr)            // set XLM SAC (blocked after deposits)
update_verifier(admin, new_verifier)    // upgrade verifier without losing state
upgrade(admin, new_wasm_hash)           // upgrade pool WASM (admin only)
update_root(admin, new_root)            // update Merkle root (admin, trusted)
register_recipient(recipient, hash)     // bind wallet to recipientHash
deposit_paid(depositor, commitment)     // lock 10 XLM + store commitment
claim_to(recipient, proof, inputs)      // verify proof + release 10 XLM
is_nullifier_used(nullifier_hash)       // check double-claim status
get_pool_stats()                        // public anonymized stats
```

**Security properties:**
* ✅ `initialize`: double-call protected
* ✅ `set_token`: admin-only, blocked after first deposit
* ✅ `update_verifier`: admin-only, enables protocol upgrades
* ✅ `upgrade`: admin-only, uses Soroban deployer
* ✅ `update_root`: admin-only (trusted component — see limitations)
* ✅ `register_recipient`: recipient must sign
* ✅ `deposit_paid`: depositor must sign + exact 10 XLM required
* ✅ `claim_to`: root check → nullifier check → proof verify → recipient check → transfer
* ✅ nullifier consumed only after all checks pass (Soroban atomicity)
* ✅ wrong recipient does not consume nullifier
* ✅ wrong root does not consume nullifier
* ✅ `deposit()` is private — free commitment spam prevented
* ✅ privacy-safe events: deposit index only, claim nullifier only (no addresses)

### GrowthipMerkleVerifierV3

Native Soroban Groth16 verifier using Protocol 25/26 BN254 host functions.

`verify(proof_bytes, public_inputs) -> bool`

**Verification steps:**
1. Deserialize proof bytes → `(G1 A, G2 B, G1 C)`
2. Load hardcoded verifying key (compiled at build time from `parameters.json`)
3. Compute `vk_x = IC[0] + MSM(IC[1..], public_inputs)`  [Protocol 26: `bn254_g1_msm`]
4. Pairing check: `e(A,B) == e(α,β) · e(vk_x,γ) · e(C,δ)`  [Protocol 25: `bn254_pairing`]
5. Return pairing result

### Test Coverage

```bash
cargo test --workspace
```

```text
growthip-merkle-verifier-v3  : 3 passed
  ✅ test_verify_growthip_merkle_note_v3_proof
  ✅ test_v3_wrong_proof_rejected
  ✅ test_v3_tampered_public_inputs_rejected

growthip-pool                : 16 passed
  ✅ test_claim_to_rejects_wrong_recipient_hash
  ✅ test_paid_deposit_and_claim_to_recipient
  ✅ test_deposit_stores_commitment
  ✅ test_claim_valid_proof_once_only
  ✅ test_claim_rejects_wrong_root
  ✅ test_initialize_twice_panics
  ✅ test_claim_to_before_recipient_registered_returns_false
  ✅ test_malformed_public_inputs_length_returns_false
  ✅ test_wrong_root_does_not_consume_nullifier
  ✅ test_update_root_unauthorized_panics
  ✅ test_set_token_unauthorized_panics
  ✅ test_set_token_blocked_after_deposits
  ✅ test_invalid_proof_does_not_consume_nullifier
  ✅ test_tampered_public_inputs_rejected
  ✅ test_update_verifier_works
  ✅ test_claim_to_with_v3_verifier_and_proof  ← V3 production path

growthip-merkle-verifier-v2  : 1 passed
growthip-merkle-verifier     : 1 passed
growthip-note-verifier       : 1 passed
square-verifier              : 1 passed

Total: 23 passed, 0 failed
```

---

## Project Structure

```text
growthip/
├── apps/
│   └── web/                              # Next.js 14 frontend
│       ├── src/
│       │   ├── app/page.tsx              # Landing page
│       │   ├── components/
│       │   │   ├── FreighterPayDemo.tsx  # Deposit flow
│       │   │   ├── ClaimDemo.tsx         # Claim flow
│       │   │   ├── LiveContractReader.tsx
│       │   │   └── ProtocolStats.tsx
│       │   └── lib/
│       │       ├── config.ts             # Centralized env config
│       │       ├── growthipProof.ts      # V3 proof artifacts
│       │       └── growthipPoolClient.ts # Generated TS binding
│       └── .env.example                  # Environment template
├── circuits/
│   ├── square.circom                     # Verifier pipeline test
│   ├── growthip_note.circom              # V0: commitment + nullifier
│   ├── growthip_merkle_note.circom       # V1: + Merkle proof
│   ├── growthip_merkle_note_v2.circom    # V2: + recipientHash output
│   └── growthip_merkle_note_v3.circom    # V3: + recipientHash in commitment ✅
├── contracts/
│   ├── square-verifier/                  # Pipeline test verifier
│   ├── growthip-note-verifier/           # V0 verifier
│   ├── growthip-merkle-verifier/         # V1 verifier
│   ├── growthip-merkle-verifier-v2/      # V2 verifier (deprecated)
│   ├── growthip-merkle-verifier-v3/      # V3 verifier ✅ active
│   └── growthip-pool/                    # Pool escrow contract ✅
├── scripts/
│   ├── make_growthip_merkle_input_v3.js  # Generate V3 input
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
* Stellar CLI
* Freighter Wallet (browser extension)
* circom 2.1.6+
* snarkjs

### Setup

```bash
# Clone
git clone [https://github.com/dzakwannajmi/Growthip](https://github.com/dzakwannajmi/Growthip)
cd growthip

# Install Node dependencies
npm install

# Copy environment template
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
# Step 1: Generate input
node scripts/make_growthip_merkle_input_v3.js

# Step 2: Generate witness
node circuits/build/growthip_merkle_note_v3_js/generate_witness.js \
  circuits/build/growthip_merkle_note_v3_js/growthip_merkle_note_v3.wasm \
  circuits/growthip_merkle_note_v3_input.json \
  circuits/build/growthip_merkle_note_v3_witness.wtns

# Step 3: Generate proof
snarkjs groth16 prove \
  circuits/build/growthip_merkle_note_v3_final.zkey \
  circuits/build/growthip_merkle_note_v3_witness.wtns \
  circuits/build/growthip_merkle_note_v3_proof.json \
  circuits/build/growthip_merkle_note_v3_public.json

# Step 4: Verify locally
snarkjs groth16 verify \
  circuits/build/growthip_merkle_note_v3_verification_key.json \
  circuits/build/growthip_merkle_note_v3_public.json \
  circuits/build/growthip_merkle_note_v3_proof.json

# Step 5: Convert to Soroban format
node scripts/convert_growthip_merkle_note_v3_snarkjs.js
```

---

## Responsible Privacy

Growthip is built for creator support, not for financial opacity. 

The pool contract is fully transparent — every deposit and withdrawal is visible on-chain. What Growthip protects is the personal link between supporter and creator, because that relationship should be private by default — just like a tip in a jar does not record your name.

* ✅ Fixed 10 XLM denomination — economically impractical for money laundering
* ✅ Recipient registration required — accountable claim flow
* ✅ Testnet only — no real assets
* ✅ Not a general-purpose mixer — application-specific tipping only
* ✅ All limitations documented honestly

**Why privacy is legitimate:**
When you tip a street musician, nobody records your name. When you support a creator in person, there is no public ledger. Growthip brings this natural privacy to blockchain-based creator support — without hiding the pool itself, and without compromising auditability of the protocol.

---

## Roadmap

**Phase 1 — Hackathon MVP ✅**
* ✅ Native BN254 Groth16 verifier on Soroban (Protocol 25/26)
* ✅ V3 circuit with cryptographic recipient binding
* ✅ Pool escrow with nullifier anti-double-claim
* ✅ Freighter deposit + claim flow
* ✅ Testnet E2E working
* ✅ 23 tests passing
* ✅ Vercel deployment

**Phase 2 — Trustless Root Management**
* On-chain incremental Merkle tree (deposit auto-updates root)
* Eliminate admin-controlled `update_root` dependency
* Multi-deposit anonymity set growth

**Phase 3 — Private Note Delivery**
* Encrypted claim note via Stellar Data Entry
* End-to-end encrypted creator inbox
* QR code claim ticket flow

**Phase 4 — Production Hardening**
* Formal security audit
* USDC on Stellar support
* View key for compliance reporting
* Allowlist / eligibility gate
* Association Set Provider (ASP) integration
* Vault Mode: offline claim signing

**Phase 5 — Creator Platform**
* Creator profile pages
* Shareable tip links
* Anonymous supporter count dashboard
* Multiple denomination pools
* Web Worker browser proof generation
* Mobile-responsive UI

---

## Prototype Notice

Growthip is a hackathon/testnet prototype.

* ❌ Not audited
* ❌ Not production-ready
* ❌ Merkle root is admin-controlled (trusted component)
* ❌ Note delivery is manual (off-chain, not encrypted)
* ❌ Small anonymity set on testnet
* ✅ Honest about all limitations
* ✅ Testnet only — no real funds at risk

---

## License

MIT — Muhammad Dzakwan Najmi