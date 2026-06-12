# Growthip — Privacy-Preserving Creator Tips on Stellar

Growthip is a privacy-preserving creator tipping prototype built on **Stellar Soroban**, **Groth16 zero-knowledge proofs**, and **Freighter wallet**.

The goal of Growthip is simple:

> Let supporters deposit a fixed tip into a creator pool, then allow the recipient to claim it with a ZK proof without publicly linking the deposit event to the claim event.

Growthip is not a mixer and not a production privacy wallet. It is a hackathon/testnet prototype focused on private creator support, ZK membership proofs, and on-chain nullifier enforcement.

---

## Current Status

Growthip now has a working end-to-end testnet flow:

* Generate a ZK note commitment.
* Deposit 10 testnet XLM into `GrowthipPool`.
* Store the commitment on-chain.
* Register a recipient hash.
* Claim the deposited tip using a Groth16 proof.
* Verify the proof through a native BN254 verifier on Soroban.
* Transfer 10 testnet XLM from the pool to the recipient.
* Mark the nullifier as used to prevent double claims.

Latest verified testnet result:

```txt
totalDeposits = 1
totalClaims = 1
```

---

## Live Demo

Live demo URL:

```txt
Coming soon after Vercel deployment.
```

The frontend currently includes:

* Landing page
* Protocol explanation
* Live testnet contract reader
* Freighter wallet connection
* Real `deposit_paid` transaction flow
* Real `register_recipient` transaction flow
* Real `claim_to` transaction flow
* Testnet proof demo using generated Growthip v2 proof artifacts

---

## Testnet Deployment

### Growthip Merkle Verifier v2

```txt
CDZWWGYDPXPABB6XX3TJ265ORLQNHZ6W2P5BZUTEK7XUGTSSWAGMB5B4
```

### Growthip Pool

```txt
CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ
```

### Native XLM Token Contract

```txt
CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

### Admin Address

```txt
GDPAPDZWAKBXUPCNMI4YHAZ7DS7UOUTPGXAFDSWZG4URRMWHFSQTDQBM
```

### Initialized Merkle Root

```txt
08e4a3225b89097da6fde1da9e0dddac702af715a4213aed88a4ff698bfecb6d
```

### Tip Amount

```txt
100000000 stroops = 10 XLM
```

---

## What Works

### ZK Circuits

Growthip includes multiple proof milestones:

```txt
circuits/square.circom
circuits/growthip_note.circom
circuits/growthip_merkle_note.circom
circuits/growthip_merkle_note_v2.circom
```

The current main circuit is:

```txt
growthip_merkle_note_v2.circom
```

It proves knowledge of:

* `secret`
* `nullifier`
* Merkle path
* Merkle path indices

and outputs:

* Merkle root
* nullifier hash
* recipient hash

### Native Soroban Verifiers

Growthip includes native BN254 verifier contracts generated from Groth16 verifying keys:

```txt
contracts/square-verifier
contracts/growthip-note-verifier
contracts/growthip-merkle-verifier
contracts/growthip-merkle-verifier-v2
```

### GrowthipPool Contract

The main pool contract is:

```txt
contracts/growthip-pool
```

It supports:

```txt
initialize
set_token
update_root
deposit
deposit_paid
register_recipient
claim
claim_to
verify
current_root
token
tip_amount
total_deposits
total_claims
get_commitment
get_recipient_hash
is_nullifier_used
```

---

## End-to-End Flow

### 1. Deposit

A supporter connects Freighter and calls:

```txt
deposit_paid(depositor, commitment)
```

The pool transfers 10 testnet XLM from the depositor into the GrowthipPool contract and stores the commitment.

Result:

```txt
TotalDeposits = TotalDeposits + 1
Commitment[index] = commitment
```

### 2. Recipient Registration

The recipient connects Freighter and calls:

```txt
register_recipient(recipient, recipient_hash)
```

The contract requires recipient authentication:

```rust
recipient.require_auth();
```

This stores the expected recipient hash for that creator address.

### 3. Claim

The recipient calls:

```txt
claim_to(recipient, proof_bytes, public_inputs)
```

The contract checks:

* recipient hash is registered
* public input length is valid
* Merkle root matches current root
* nullifier has not been used
* Groth16 proof verifies successfully
* recipient hash matches the registered recipient hash

If valid, the contract transfers 10 testnet XLM from the pool to the recipient and marks the nullifier as used.

Result:

```txt
TotalClaims = TotalClaims + 1
NullifierUsed[nullifierHash] = true
```

---

## Frontend

The frontend lives in:

```txt
apps/web
```

Stack:

```txt
Next.js
Tailwind CSS
Freighter API
Generated Stellar TypeScript contract binding
```

Run locally:

```bash
cd apps/web
npm install
npm run dev
```

Build:

```bash
npm run lint
npm run build
```

---

## Generated TypeScript Binding

The GrowthipPool TypeScript client is generated in:

```txt
packages/growthip-pool-client
```

Generated using:

```bash
stellar contract bindings typescript \
  --contract-id CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ \
  --network testnet \
  --output-dir packages/growthip-pool-client
```

Build the package:

```bash
cd packages/growthip-pool-client
npm install
npm run build
```

Install it into the frontend:

```bash
cd apps/web
npm install ../../packages/growthip-pool-client
```

---

## Local Development

### Install dependencies

```bash
npm install
```

### Build Soroban contracts

```bash
stellar contract build
```

### Run Rust/Soroban tests

```bash
cargo test --workspace -- --nocapture
```

### Run frontend

```bash
cd apps/web
npm run dev
```

---

## Test Coverage

Growthip includes local contract tests for verifier and pool behavior.

Current GrowthipPool tests include:

```txt
test_claim_to_rejects_wrong_recipient_hash
test_paid_deposit_and_claim_to_recipient
test_deposit_stores_commitment
test_claim_valid_proof_once_only
test_claim_rejects_wrong_root
test_initialize_twice_panics
test_claim_to_before_recipient_registered_returns_false
test_malformed_public_inputs_length_returns_false
test_wrong_root_does_not_consume_nullifier
```

Current workspace status:

```txt
growthip_merkle_verifier: passed
growthip_merkle_verifier_v2: passed
growthip_note_verifier: passed
growthip_pool: passed
square_verifier: passed
```

---

## Security Model

Growthip is a prototype with a focused threat model.

It currently demonstrates:

* Groth16 proof verification on Stellar Soroban
* Merkle membership proof
* nullifier-based double-claim prevention
* recipient hash check at contract level
* fixed-denomination testnet escrow
* real Freighter-signed testnet transactions

---

## Known Limitations

### 1. Recipient Binding Is Contract-Level in v2

In the current v2 circuit, `recipientHash` is included as a public output but is not bound inside the commitment hash.

Current v2 structure:

```txt
commitment = Poseidon(secret, nullifier)
nullifierHash = Poseidon(nullifier)
recipientHashOut = recipientHash
```

The pool mitigates this by checking that the proof recipient hash matches the registered recipient hash for the claiming address.

However, this is contract-level protection, not ZK-level binding.

Planned v3 improvement:

```txt
commitment = Poseidon(secret, nullifier, recipientHash)
```

This would cryptographically bind the recipient into the note commitment and prevent recipient substitution at the circuit level.

### 2. Admin-Controlled Merkle Root

The current Merkle root is updated by an admin-controlled function.

This is acceptable for the prototype but should be decentralized or made append-only in a production design.

### 3. Off-Chain Note Delivery

Growthip does not currently encrypt or deliver notes. The private note is handled off-chain by the user/demo flow.

### 4. Small Testnet Anonymity Set

The prototype testnet pool currently has a very small anonymity set.

### 5. Not Audited

Growthip is not audited and should not be used with real funds.

---

## Roadmap

### Short Term

* Deploy frontend to Vercel
* Add live demo URL
* Improve README screenshots and demo evidence
* Add a polished claim UX
* Add invalid proof regression test for nullifier non-consumption

### Medium Term

* v3 circuit with recipient-bound commitment
* append-only Merkle tree management
* multiple supported denominations
* better note format
* encrypted note delivery
* improved proof generation UX

### Long Term

* production-grade audit
* decentralized root management
* stronger privacy UX
* creator dashboard
* view key or compliance-friendly optional disclosure mode

---

## Project Structure

```txt
growthip/
├── apps/
│   └── web/
│       └── Next.js frontend
├── circuits/
│   ├── square.circom
│   ├── growthip_note.circom
│   ├── growthip_merkle_note.circom
│   └── growthip_merkle_note_v2.circom
├── contracts/
│   ├── square-verifier
│   ├── growthip-note-verifier
│   ├── growthip-merkle-verifier
│   ├── growthip-merkle-verifier-v2
│   └── growthip-pool
├── deployments/
│   ├── testnet.env
│   └── testnet.md
├── packages/
│   └── growthip-pool-client
├── scripts/
│   ├── make_growthip_merkle_input_v2.js
│   └── convert_growthip_merkle_note_v2_snarkjs.js
└── README.md
```

---

## Why Growthip Matters

Public creator payments reveal relationships between supporters and recipients.

For many creators, activists, educators, open-source maintainers, or community builders, support should be possible without exposing every relationship publicly.

Growthip demonstrates how Stellar Soroban and zero-knowledge proofs can be combined to create a private support primitive:

```txt
deposit publicly
prove privately
claim safely
prevent double claims
```

---

## Prototype Notice

Growthip is a hackathon/testnet prototype.

Do not use it with real funds.

The current implementation is designed to demonstrate feasibility, protocol architecture, and end-to-end ZK verification on Stellar Soroban.
