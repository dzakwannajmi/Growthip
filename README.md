# Growthip

**Growthip** is a privacy-preserving creator tipping prototype built on **Stellar Soroban**.

Growthip allows supporters to send fixed-value tips into a privacy pool, while creators can later claim support using a zero-knowledge proof. The goal is to protect the direct supporter-to-creator relationship without exposing which deposit is being claimed.

> Growthip = Grow + Tip  
> A private creator support layer for Stellar builders, creators, students, open-source maintainers, and community contributors.

---

## Testnet Deployment

Growthip core contracts have been built, deployed, and initialized on **Stellar Testnet**.

| Component | Contract ID |
|---|---|
| Growthip Merkle Verifier v2 | `CDZWWGYDPXPABB6XX3TJ265ORLQNHZ6W2P5BZUTEK7XUGTSSWAGMB5B4` |
| Growthip Pool | `CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ` |
| Native XLM Token Contract | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

Initialized state:

```txt
current_root = 08e4a3225b89097da6fde1da9e0dddac702af715a4213aed88a4ff698bfecb6d
tip_amount   = 100000000
deposits     = 0
claims       = 0
```

---

## Problem

Most creator tipping systems publicly expose the relationship between supporter and creator.

That means people can often see:

- who supported whom
- which wallet funded which creator
- when a supporter funded a creator
- how support activity connects across accounts

For public creators, students, open-source maintainers, and community builders, this can create unwanted visibility.

Growthip focuses on **relationship privacy**.

The pool contract should know:

- a valid note exists
- the note belongs to a valid Merkle root
- the note has not been claimed before
- the recipient is the intended recipient

But the contract should not know:

- the private secret
- the private nullifier
- which commitment was used
- which exact deposit is being claimed

---

## Core Idea

Growthip uses a fixed-denomination tipping pool.

Simplified flow:

```txt
Supporter
  |
  | deposit fixed-value tip + commitment
  v
GrowthipPool Contract
  |
  | stores commitment
  v
Merkle Tree
  |
  | private note is shared off-chain
  v
Creator / Recipient
  |
  | generates ZK proof
  v
GrowthipPool Contract
  |
  | verifies proof
  | checks root
  | checks nullifierHash
  | checks recipientHash
  v
Recipient receives token claim
```

---

## Current Status

The core ZK escrow flow is implemented, tested locally, built to WASM, deployed, and initialized on Stellar Testnet.

Implemented:

- Circom circuits
- Groth16 proof generation
- BN254 proof verification
- Native Soroban-style verifier contracts
- Merkle membership proof
- Nullifier-based double-claim prevention
- Recipient hash binding
- Token escrow pool
- Commitment deposit registry
- Wrong root rejection
- Wrong recipient rejection
- Full workspace tests passing
- Testnet deployment artifacts

Not implemented yet:

- Frontend UI
- Freighter wallet integration
- Production Merkle tree service
- Production note delivery system
- Relayer system
- Mainnet deployment
- Audit

---

## Architecture

```txt
growthip/
├── circuits/
│   ├── square.circom
│   ├── growthip_note.circom
│   ├── growthip_merkle_note.circom
│   └── growthip_merkle_note_v2.circom
│
├── contracts/
│   ├── square-verifier/
│   ├── growthip-note-verifier/
│   ├── growthip-merkle-verifier/
│   ├── growthip-merkle-verifier-v2/
│   └── growthip-pool/
│
├── scripts/
│   ├── convert_square_snarkjs.js
│   ├── convert_growthip_note_snarkjs.js
│   ├── convert_growthip_merkle_note_snarkjs.js
│   ├── convert_growthip_merkle_note_v2_snarkjs.js
│   ├── make_growthip_merkle_input.js
│   └── make_growthip_merkle_input_v2.js
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEMO_SCRIPT.md
│   ├── LIMITATIONS.md
│   └── TECHNICAL_DECISIONS.md
│
├── deployments/
│   ├── testnet.env
│   └── testnet.md
│
├── Cargo.toml
├── package.json
└── README.md
```

---

## ZK Circuits

### 1. Square Circuit

A simple dummy circuit used to prove the native BN254 verifier path.

```txt
private input:
- x

public output:
- y

constraint:
x * x = y
```

Purpose:

- verify Circom/snarkjs Groth16 proof locally
- convert snarkjs proof into Soroban-compatible format
- verify proof inside a Soroban-style BN254 verifier test

---

### 2. Growthip Note v0

The first Growthip-specific circuit.

```txt
private inputs:
- secret
- nullifier

public outputs:
- commitment
- nullifierHash
```

Logic:

```txt
commitment = Poseidon(secret, nullifier)
nullifierHash = Poseidon(nullifier)
```

Purpose:

- prove knowledge of a private note
- generate a public nullifier hash for double-claim prevention

Limitation:

- the commitment is still public, so this is not enough for the final privacy flow

---

### 3. Growthip Merkle Note v1

Adds Merkle membership.

```txt
private inputs:
- secret
- nullifier
- pathElements
- pathIndices

public outputs:
- root
- nullifierHash
```

Logic:

```txt
commitment = Poseidon(secret, nullifier)
nullifierHash = Poseidon(nullifier)
root = MerkleRoot(commitment, pathElements, pathIndices)
```

Purpose:

- prove that a private commitment exists in the Merkle tree
- keep the commitment private during claim
- prevent double-claim using nullifierHash

---

### 4. Growthip Merkle Note v2

Adds recipient binding.

```txt
private inputs:
- secret
- nullifier
- pathElements
- pathIndices

public outputs:
- root
- nullifierHash
- recipientHash
```

Purpose:

- prevent a valid proof from being redirected to another recipient
- bind the claim proof to a registered recipient hash
- improve claim security

This is the current main Growthip proof circuit.

---

## Smart Contracts

### `growthip-merkle-verifier-v2`

Verifier for Growthip Merkle Note v2.

It verifies:

```txt
root
nullifierHash
recipientHash
Merkle membership
recipient-bound claim proof
```

This is the current preferred verifier.

---

### `growthip-pool`

The main escrow pool contract.

Current responsibilities:

- store verifier address
- store token address
- store current Merkle root
- store commitments by index
- track total deposits
- track total claims
- register recipient hash
- verify claim proof
- reject wrong root
- reject used nullifier
- reject wrong recipient
- transfer token from supporter to pool
- transfer token from pool to recipient after successful proof verification

---

## GrowthipPool Flow

### Deposit

```txt
supporter -> deposit_paid(commitment)
```

The pool:

1. Requires supporter authorization
2. Transfers fixed token amount from supporter to pool
3. Stores commitment by index
4. Increments total deposits
5. Returns commitment index

---

### Claim

```txt
recipient -> claim_to(recipient, proof, publicInputs)
```

The pool:

1. Checks public inputs length
2. Reads:
   - root
   - nullifierHash
   - recipientHash
3. Checks root equals current root
4. Checks nullifierHash has not been used
5. Checks recipientHash matches registered recipient
6. Calls native BN254 verifier
7. Marks nullifierHash as used
8. Transfers token from pool to recipient

---

## Security Properties

Implemented security checks:

- valid ZK proof is required
- Merkle root must match the current root
- nullifier cannot be used twice
- wrong root is rejected
- wrong recipient is rejected
- failed wrong-recipient claim does not consume the nullifier
- correct recipient can still claim after failed wrong-recipient attempt

Current privacy model:

```txt
Public:
- pool contract
- root
- nullifierHash
- recipientHash
- claim transaction
- fixed token amount

Private:
- secret
- nullifier
- commitment used in the proof
- Merkle path
- exact deposit-to-claim link
```

Important limitation:

Growthip currently provides relationship privacy at the prototype level. It does not provide complete anonymity against timing analysis, small anonymity sets, or off-chain metadata leaks.

---

## Fixed Denomination

Growthip currently uses a fixed tip amount.

In the contract:

```rust
const TIP_AMOUNT: i128 = 100_000_000;
```

This represents a 10-unit token amount with 7-decimal Stellar-style precision.

The fixed-denomination design helps reduce amount-based linkability.

---

## Tests

Run all workspace tests:

```bash
cargo test --workspace -- --nocapture
```

Current test coverage includes:

```txt
square-verifier:
- test_verify_square_proof

growthip-note-verifier:
- test_verify_growthip_note_v0_proof

growthip-merkle-verifier:
- test_verify_growthip_merkle_note_v1_proof

growthip-merkle-verifier-v2:
- test_verify_growthip_merkle_note_v2_proof

growthip-pool:
- test_deposit_stores_commitment
- test_claim_valid_proof_once_only
- test_claim_rejects_wrong_root
- test_paid_deposit_and_claim_to_recipient
- test_claim_to_rejects_wrong_recipient_hash
```

Latest result:

```txt
All workspace tests passed.
```

---

## Build

Build all Soroban contracts to WASM:

```bash
stellar contract build
```

Important generated WASM files:

```txt
target/wasm32v1-none/release/growthip_merkle_verifier_v2.wasm
target/wasm32v1-none/release/growthip_pool.wasm
```

---

## Testnet Verification Commands

Read current root:

```bash
stellar contract invoke \
  --id CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ \
  --source-account najmi \
  --network testnet \
  -- current_root
```

Read token:

```bash
stellar contract invoke \
  --id CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ \
  --source-account najmi \
  --network testnet \
  -- token
```

Read tip amount:

```bash
stellar contract invoke \
  --id CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ \
  --source-account najmi \
  --network testnet \
  -- tip_amount
```

---

## Proof Artifact Conversion

Growthip uses snarkjs to generate Groth16 proof artifacts, then converts them into a format suitable for the Soroban BN254 verifier.

The proof layout is:

```txt
A(G1) || B(G2) || C(G1)
```

Expected proof size:

```txt
256 bytes
512 hex chars
```

For v2 public inputs:

```txt
root
nullifierHash
recipientHash
```

Expected public input size:

```txt
3 * 32 bytes = 96 bytes
192 hex chars
```

---

## Native BN254 Verification

Growthip uses a native BN254 Groth16 verification path.

The verifier performs a pairing check equivalent to:

```txt
e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
```

Where:

```txt
vk_x = IC[0] + publicInput[0] * IC[1] + ... + publicInput[n] * IC[n+1]
```

---

## Development Notes

This project intentionally progresses in small verified checkpoints:

1. Dummy square proof
2. Growthip note proof
3. Growthip Merkle proof
4. Native BN254 verifier
5. Pool claim verification
6. Token escrow
7. Recipient hash binding
8. Full workspace tests
9. WASM build
10. Stellar Testnet deployment

This avoids overbuilding and makes each cryptographic step testable.

---

## Roadmap

### Completed

- Circom proof generation
- Groth16 setup
- snarkjs local verification
- BN254 proof conversion
- Soroban-style native verifier tests
- Merkle membership proof
- Nullifier anti double-claim
- Token escrow test
- Recipient hash binding
- Wrong recipient rejection
- WASM contract build
- Stellar Testnet deployment
- Pool initialization on testnet

### Next

- Frontend demo
- Freighter wallet connection
- Creator profile page
- Private note generation UI
- Proof generation UI
- Claim page
- QR/shareable tip link
- Testnet `deposit_paid` transaction
- Testnet `claim_to` transaction
- 2–3 minute demo video

### Future

- Larger Merkle tree
- Better note format
- Safer recipient identity binding
- Better relayer or privacy UX
- Improved frontend proof generation
- Security review
- Audit before any mainnet use

---

## Responsible Use

Growthip is designed for voluntary creator support.

Users should:

- verify creator identity before tipping
- avoid pressure-based or manipulative tipping
- understand that this is a prototype
- avoid using it with real funds before audit
- treat testnet/demo tokens as experimental only

---

## Disclaimer

Growthip is a research and hackathon prototype.

It is:

- not audited
- not production-ready
- not financial advice
- not a mixer
- not a full private wallet
- not designed for illegal activity

Use only for testing, education, and demonstration.

---

## License

MIT License.

---

## Author

Built by **Muhammad Dzakwan Najmi**.

GitHub: [@dzakwannajmi](https://github.com/dzakwannajmi)
