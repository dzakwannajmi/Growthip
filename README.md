# Growthip — Privacy-Preserving Creator Tips on Stellar

Growthip is a privacy-preserving creator tipping prototype built on **Stellar Soroban**, **Freighter Wallet**, and **Groth16 zero-knowledge proofs**.

Growthip lets a supporter deposit a fixed tip into a Soroban pool, while a creator later claims the tip using a ZK proof. The protocol separates the public deposit event from the public claim event, while still preventing double-claims through an on-chain nullifier.

> Deposit publicly. Claim privately. Prevent double-claims.

---

## Live Demo

```txt
Live Demo: <PASTE_YOUR_VERCEL_URL_HERE>
Network: Stellar Testnet
Wallet: Freighter
```

The deployed frontend supports:

```txt
✅ Live GrowthipPool state reader
✅ Freighter wallet connection
✅ Real deposit_paid transaction on Stellar Testnet
✅ Real register_recipient transaction on Stellar Testnet
✅ Real claim_to transaction with Groth16 proof on Stellar Testnet
✅ Native XLM SAC transfer into the pool
✅ Native XLM SAC transfer out to the recipient
✅ On-chain nullifier consumption to prevent double-claim
```

---

## Project Summary

Growthip is designed for creator monetization use cases where supporters and creators may want more relationship privacy than a normal public crypto donation address.

In a normal public crypto donation flow:

```txt
supporter wallet → creator wallet
```

the relationship is visible on-chain.

In Growthip:

```txt
supporter deposits → pool stores commitment
creator claims → ZK proof verifies note membership
```

The public can see deposits and claims, but the direct relationship between a specific deposit and a specific claim is not trivially exposed.

Growthip is not a general-purpose mixer. It is a focused prototype for **privacy-preserving creator support** and **ZK-based claim authorization**.

---

## Current Testnet Status

Growthip has completed an end-to-end testnet flow:

```txt
fresh note
→ fresh commitment
→ fresh Merkle root
→ update_root
→ deposit_paid
→ register_recipient
→ claim_to
→ proof verified
→ nullifier consumed
→ XLM transferred to recipient
```

Verified state after testnet demo:

```txt
Total Deposits: 4+
Total Claims: 1+
```

The exact numbers may increase as more testnet deposits and claim demos are performed.

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

### Network

```txt
Stellar Testnet
```

### Admin Address

```txt
GDPAPDZWAKBXUPCNMI4YHAZ7DS7UOUTPGXAFDSWZG4URRMWHFSQTDQBM
```

### Tip Amount

```txt
100000000 stroops = 10 XLM
```

---

## What Growthip Demonstrates

Growthip demonstrates the following technical primitives on Stellar:

```txt
✅ Soroban smart contract escrow pool
✅ Native BN254 Groth16 verification
✅ Merkle membership proof
✅ Poseidon-based commitment and nullifier hash
✅ Nullifier-based double-claim prevention
✅ Recipient hash registration
✅ Freighter-signed deposit transaction
✅ Freighter-signed claim transaction
✅ TypeScript contract binding integration
✅ Next.js frontend connected to Stellar Testnet
```

---

## How the Protocol Works

### 1. Deposit

A supporter generates a private note and a public commitment.

The supporter calls:

```txt
deposit_paid(depositor, commitment)
```

The pool contract:

```txt
- requires depositor authorization
- transfers 10 testnet XLM from depositor to the pool
- stores the commitment
- increments totalDeposits
```

The deposit does not directly specify the final creator wallet. This is intentional, because linking a supporter wallet directly to a creator wallet would weaken privacy.

---

### 2. Private Note

A private note acts like a secret claim ticket.

Conceptually, it contains:

```txt
secret
nullifier
recipientHash
Merkle path data
```

Whoever holds the valid note can generate a proof. In a real production version, the note should be encrypted to the creator and delivered through a secure private inbox or encrypted claim link.

In the current prototype, the note/proof artifact is handled as a controlled testnet demo artifact.

---

### 3. Recipient Registration

A creator or recipient registers their recipient hash:

```txt
register_recipient(recipient, recipient_hash)
```

The contract requires:

```rust
recipient.require_auth();
```

This binds the recipient wallet to the expected recipient hash at the contract level.

---

### 4. Claim

The recipient calls:

```txt
claim_to(recipient, proof_bytes, public_inputs)
```

The contract checks:

```txt
- public input length is valid
- Merkle root matches current root
- nullifier has not been used
- Groth16 proof verifies successfully
- recipientHash matches the registered recipient hash
```

If valid, the pool transfers 10 XLM to the recipient and marks the nullifier as used.

```txt
NullifierUsed[nullifierHash] = true
TotalClaims = TotalClaims + 1
```

This prevents the same proof/note from being claimed twice.

---

## Frontend Demo Flow

The frontend has three main sections.

### 1. Live Contract Reader

Reads GrowthipPool state directly from Stellar Testnet.

It displays:

```txt
Current Root
Token
Tip Amount
Total Deposits
Total Claims
```

### 2. Freighter Pay Demo

Supporter flow:

```txt
Connect Freighter
→ Prepare Private Note
→ Deposit 10 XLM
→ Approve transaction in Freighter
```

This calls:

```txt
deposit_paid(depositor, commitment)
```

### 3. Live Claim Demo

Creator/recipient flow:

```txt
Connect Freighter
→ Register Recipient
→ Claim 10 XLM
→ Approve transaction in Freighter
```

This calls:

```txt
register_recipient(recipient, recipient_hash)
claim_to(recipient, proof_bytes, public_inputs)
```

After a successful claim, the same proof cannot be claimed again because the nullifier is already consumed.

---

## Important UX Note

The current demo proof can only be claimed once.

If `Claim 10 XLM` is clicked again with the same proof artifact, the claim should not succeed again. That is expected behavior.

This proves:

```txt
✅ one proof = one claim
✅ nullifier anti-double-claim works
✅ repeated claim attempt is rejected/no-op
```

To run a fresh claim demo again, generate a fresh note, fresh root, and fresh proof, then update the pool root before depositing and claiming again.

---

## Fresh Proof Demo Flow

Growthip supports regenerating a fresh testnet proof flow without redeploying the verifier.

High-level flow:

```txt
generate fresh note
generate fresh commitment
generate fresh Merkle root
generate witness
generate Groth16 proof
convert proof to contract bytes
update_root on GrowthipPool
deposit the matching commitment
register recipient
claim with the fresh proof
```

This allows repeated end-to-end demos with new nullifiers and new roots.

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

## Circuits

Growthip includes multiple ZK circuit milestones.

### Square Circuit

```txt
circuits/square.circom
```

A minimal proof circuit used to validate the Groth16 → Soroban verifier pipeline.

### Growthip Note v0

```txt
circuits/growthip_note.circom
```

Proves knowledge of:

```txt
secret
nullifier
```

and outputs:

```txt
commitment
nullifierHash
```

### Growthip Merkle Note v1

```txt
circuits/growthip_merkle_note.circom
```

Adds Merkle membership proof support.

### Growthip Merkle Note v2

```txt
circuits/growthip_merkle_note_v2.circom
```

Current main circuit.

It proves knowledge of:

```txt
secret
nullifier
pathElements
pathIndices
```

and exposes:

```txt
root
nullifierHash
recipientHash
```

---

## Contracts

### `growthip-merkle-verifier-v2`

Native Soroban verifier for the Growthip Merkle v2 Groth16 proof.

### `growthip-pool`

Main escrow and claim contract.

Exported functions include:

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

## TypeScript Contract Client

The GrowthipPool TypeScript binding was generated using Stellar CLI:

```bash
stellar contract bindings typescript \
  --contract-id CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ \
  --network testnet \
  --output-dir packages/growthip-pool-client
```

For Vercel deployment simplicity, the generated client is also vendored into the frontend as:

```txt
apps/web/src/lib/growthipPoolClient.ts
```

The frontend imports the client from the local app source.

---

## Local Development

### Requirements

```txt
Node.js
npm
Rust
Stellar CLI
Freighter Wallet
snarkjs
circom
```

### Install Frontend Dependencies

```bash
cd apps/web
npm install
```

### Run Frontend Locally

```bash
cd apps/web
npm run dev
```

Open:

```txt
http://localhost:3000
```

### Production Build

```bash
cd apps/web
npm run build
npm run start
```

---

## Run Contract Tests

From the repository root:

```bash
cargo test --workspace -- --nocapture
```

GrowthipPool test coverage includes:

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

---

## Generate Fresh Growthip v2 Proof

From the repository root:

```bash
node scripts/make_growthip_merkle_input_v2.js
```

Generate witness:

```bash
npx snarkjs wtns calculate \
  circuits/build/growthip_merkle_note_v2_js/growthip_merkle_note_v2.wasm \
  circuits/growthip_merkle_note_v2_input.json \
  circuits/build/growthip_merkle_note_v2_witness.wtns
```

Generate proof:

```bash
npx snarkjs groth16 prove \
  circuits/build/growthip_merkle_note_v2_final.zkey \
  circuits/build/growthip_merkle_note_v2_witness.wtns \
  circuits/build/growthip_merkle_note_v2_proof.json \
  circuits/build/growthip_merkle_note_v2_public.json
```

Convert proof for Soroban contract input:

```bash
node scripts/convert_growthip_merkle_note_v2_snarkjs.js
```

Generated artifacts:

```txt
circuits/build/growthip_merkle_note_v2_demo_note.json
circuits/build/growthip_merkle_note_v2_proof_abc.hex
circuits/build/growthip_merkle_note_v2_public_inputs.hex
circuits/build/growthip_merkle_note_v2_public_inputs.json
```

---

## Update Pool Root

After generating a fresh note and proof, compute the fresh root and update the GrowthipPool root.

```bash
FRESH_ROOT=$(python3 - << 'PY'
import json
from pathlib import Path
note = json.loads(Path("circuits/build/growthip_merkle_note_v2_demo_note.json").read_text())
print(f'{int(note["root"]):064x}')
PY
)

echo $FRESH_ROOT
```

Update root:

```bash
stellar contract invoke \
  --id CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ \
  --source-account najmi \
  --network testnet \
  -- \
  update_root \
  --admin GDPAPDZWAKBXUPCNMI4YHAZ7DS7UOUTPGXAFDSWZG4URRMWHFSQTDQBM \
  --new_root $FRESH_ROOT
```

Check current root:

```bash
stellar contract invoke \
  --id CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ \
  --source-account najmi \
  --network testnet \
  -- \
  current_root
```

---

## Security Model

Growthip demonstrates a prototype-grade privacy model:

```txt
- deposits store commitments
- claims require valid ZK proof
- nullifiers prevent double claims
- recipientHash is checked by the pool
- fixed tip amount improves privacy set consistency
```

The protocol is designed for legitimate creator/supporter privacy, not for hiding illicit funds.

---

## Known Limitations

### 1. Recipient Binding Is Contract-Level in v2

In the current v2 circuit, `recipientHash` is included as a public output, but it is not bound inside the commitment.

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

The current testnet prototype uses an admin-controlled `update_root` flow.

This is acceptable for a prototype, but production should move toward append-only Merkle tree management or a more decentralized root update mechanism.

### 3. Manual / Prototype Note Delivery

The current demo handles private notes and proof artifacts manually.

Production should use:

```txt
encrypted claim links
encrypted creator inbox
wallet-to-wallet encrypted message delivery
```

### 4. Small Testnet Anonymity Set

The current testnet pool has a small anonymity set.

Privacy improves as more deposits share the same denomination and pool.

### 5. Not Audited

Growthip has not been professionally audited.

Do not use with real funds.

---

## Roadmap

### Now / Hackathon

```txt
✅ Soroban pool contract
✅ Native Groth16 verifier
✅ Merkle proof circuit
✅ Freighter deposit flow
✅ Freighter claim flow
✅ Live testnet state reader
✅ Vercel deployment
```

### Next

```txt
- Polish demo video
- Add screenshots to README
- Improve claim UX wording
- Add invalid-proof nullifier regression test
- Improve fresh proof generation automation
```

### V1

```txt
- Encrypted creator inbox
- Encrypted claim note delivery
- USDC on Stellar support
- Batch claim UX
- Creator profile page
- Privacy-preserving public dashboard
```

### V2

```txt
- v3 recipient-bound circuit
- append-only Merkle tree
- relayer-assisted gasless claim
- Web Worker proof generation
- optional viewing keys for creator reporting
```

---

## Product Direction

Growthip should be positioned in two layers.

For technical audiences:

```txt
ZK-Based Creator Monetization Protocol on Stellar Soroban
```

For normal users:

```txt
Private tipping platform for creators and supporters
```

The core product thesis:

> Creator monetization should not require exposing every supporter relationship publicly on-chain.

---

## Business Model Ideas

Potential future monetization models:

```txt
0% fee during testnet / beta
1%–1.5% platform fee on successful claims
small flat relayer fee for gasless claims
optional Creator Pro subscription
white-label API for creator platforms
```

Growthip should avoid launching its own token in the early stage.

Production should prioritize:

```txt
USDC on Stellar
low fees
clear compliance positioning
encrypted note delivery
creator dashboard UX
```

---

## Privacy-Preserving Dashboard Direction

Safe public dashboard metrics:

```txt
Total Deposited
Total Claimed
Pool Balance
Number of Private Tips
Number of Registered Creators
```

Metrics to avoid:

```txt
Top depositor wallet ranking
Supporter address list
Direct supporter-to-creator relation
Realtime deposit-to-claim correlation
```

Creator leaderboard should be opt-in.

---

## Prototype Notice

Growthip is a hackathon/testnet prototype.

It is not audited, not production-ready, and should not be used with real funds.

The goal is to demonstrate that Stellar Soroban can support practical ZK-based creator monetization flows with real testnet transactions and on-chain proof verification.

---

## License

MIT
