# Technical Decisions — Growthip

## Project
Growthip — privacy-preserving creator tipping platform on Stellar.

## Current Technical Direction
- Curve: BN254
- Circuit language: Circom
- Proof system: Groth16
- Proof generation: snarkjs
- Target verifier: Native Soroban verifier using Stellar Protocol 25/26 BN254 host functions
- Reference repo: NethermindEth/stellar-risc0-verifier
- Fallback: Hybrid verification if native dummy proof is not working by Day 3

## MVP
- Creator profile
- Shareable tip link
- QR code
- Fixed 10 XLM private tip pool
- Deposit to pool
- Private note
- Claim with ZK proof
- Nullifier check
- Merkle root check
- Anonymous dashboard stats

## Not Building in MVP
- New token
- Referral system
- Full SocialFi
- Full private wallet
- Multi-token
- Arbitrary private amount
- Relayer
- Encrypted messaging
- Cold wallet

## Critical Unknown
Can the NethermindEth/stellar-risc0-verifier Groth16 verifier verify generic Circom/snarkjs Groth16 proofs, or only RISC Zero seals?

## Decision Gate
If native dummy proof verification is not working by Day 3, lock hybrid fallback and continue product build.

## Native BN254 Verifier Checkpoint

Date: current development checkpoint

Result:
The native BN254 Groth16 verification path is feasible.

We successfully verified a Circom/snarkjs Groth16 proof inside a Soroban-style Rust contract unit test.

Dummy circuit:
- Circuit: square.circom
- Statement: prove knowledge of x such that x * x = y
- Private input: x = 2
- Public input: y = 4

Verification result:
- snarkjs local verification: OK
- Soroban SDK unit test: passed
- Proof byte format: A(G1) || B(G2) || C(G1), 256 bytes
- Public input format: 32-byte BN254 Fr field elements
- Verifying key: embedded at compile time from converted snarkjs verification_key.json

Decision:
Continue with native BN254 verifier path for Growthip.

Important:
The NethermindEth/stellar-risc0-verifier repo is used as a verifier template/reference, not as a direct plug-and-play RISC Zero verifier.

## Growthip Note v0 Checkpoint

Result:
Growthip note v0 circuit has been verified locally and inside a Soroban-style BN254 verifier test.

Circuit:
- circuits/growthip_note.circom

Private inputs:
- secret
- nullifier

Public outputs:
- commitment = Poseidon(secret, nullifier)
- nullifierHash = Poseidon(nullifier)

Verification:
- snarkjs local verification: OK
- growthip-note-verifier Soroban-style unit test: passed

Conclusion:
The Growthip-specific ZK stack works with Circom, snarkjs, Groth16, BN254, and native Soroban-style verifier logic.

## Growthip Note v0 Checkpoint

Result:
Growthip note v0 circuit has been verified locally and inside a Soroban-style BN254 verifier test.

Circuit:
- circuits/growthip_note.circom

Private inputs:
- secret
- nullifier

Public outputs:
- commitment = Poseidon(secret, nullifier)
- nullifierHash = Poseidon(nullifier)

Verification:
- snarkjs local verification: OK
- growthip-note-verifier Soroban-style unit test: passed

Conclusion:
The Growthip-specific ZK stack works with Circom, snarkjs, Groth16, BN254, and native Soroban-style verifier logic.

## Growthip Note v0 Checkpoint

Result:
Growthip note v0 circuit has been verified locally and inside a Soroban-style BN254 verifier test.

Circuit:
- circuits/growthip_note.circom

Private inputs:
- secret
- nullifier

Public outputs:
- commitment = Poseidon(secret, nullifier)
- nullifierHash = Poseidon(nullifier)

Verification:
- snarkjs local verification: OK
- growthip-note-verifier Soroban-style unit test: passed

Conclusion:
The Growthip-specific ZK stack works with Circom, snarkjs, Groth16, BN254, and native Soroban-style verifier logic.

## Growthip Merkle Note v1 Checkpoint

Result:
Growthip Merkle Note v1 circuit has been verified locally and inside a Soroban-style BN254 verifier test.

Circuit:
- circuits/growthip_merkle_note.circom

Private inputs:
- secret
- nullifier
- pathElements
- pathIndices

Public outputs:
- root
- nullifierHash

Verification:
- snarkjs local verification: OK
- growthip-merkle-verifier Soroban-style unit test: passed

Conclusion:
The core ZK privacy proof for Growthip works:
- The prover knows a valid note
- The note commitment exists in a Merkle tree
- The contract only sees root and nullifierHash
- The contract does not see secret, nullifier, or commitment

## GrowthipPool v0 Checkpoint

Result:
GrowthipPool v0 claim logic works in Soroban SDK tests.

Implemented:
- Stores current Merkle root
- Stores verifier contract address
- Checks proof public input root against current root
- Checks nullifierHash has not been used
- Calls GrowthipMerkleVerifier
- Marks nullifierHash as used after successful claim
- Rejects double-claim
- Rejects wrong root
- Tracks total claims

Not implemented yet:
- XLM token transfer
- Deposit payment
- Platform fee
- Testnet deployment

## GrowthipPool v0 Checkpoint

Result:
GrowthipPool v0 claim logic works in Soroban SDK tests.

Implemented:
- Stores current Merkle root
- Stores verifier contract address
- Checks proof public input root against current root
- Checks nullifierHash has not been used
- Calls GrowthipMerkleVerifier
- Marks nullifierHash as used after successful claim
- Rejects double-claim
- Rejects wrong root
- Tracks total claims

Not implemented yet:
- XLM token transfer
- Deposit payment
- Platform fee
- Testnet deployment

## GrowthipPool Token Escrow v0 Checkpoint

Result:
GrowthipPool v0 token escrow test passed.

Implemented:
- deposit_paid transfers mock Stellar asset token from supporter to pool
- commitment is stored by index
- claim_to verifies ZK proof and nullifier
- successful claim transfers token from pool to recipient
- double claim is rejected

Test result:
- growthip-pool: 4 tests passed

Security note:
The current claim_to recipient is not yet cryptographically bound to the proof.
Next step is Growthip Merkle Note v2 with recipientHash as a public signal.

## GrowthipPool v2 Recipient Binding Checkpoint

Result:
GrowthipPool now uses Growthip Merkle Note v2 with recipientHash binding.

Implemented:
- Growthip Merkle Note v2 public outputs:
  - root
  - nullifierHash
  - recipientHash
- Pool stores registered recipientHash per recipient address
- claim_to checks proof recipientHash against registered recipient
- wrong recipient is rejected
- failed wrong recipient claim does not consume nullifierHash
- correct recipient can still claim after failed wrong attempt
- token escrow flow remains working

Test result:
- growthip-pool: 5 tests passed

Security improvement:
A valid proof can no longer be redirected to an arbitrary recipient address unless that recipient matches the recipientHash bound in the proof.
