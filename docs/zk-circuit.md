# ZK Circuit

> Part of the Growthip documentation set. See the [root README](../README.md) for the project overview.

---

## ZK Circuit

### V4 Circuit (Current) — `circuits/growthip_merkle_note_v4.circom`

V4 builds on V3.1's recipient binding and deposit-amount-aware claims, upgrading the Merkle tree from depth-3 (8 leaves) to **depth-20 (1,048,576 leaves)** using an incremental frontier-based approach. No pool redeployment needed as deposits grow. See [Security History, Issue #3](#security-history-honest-disclosure) for the original deposit-amount fix.

```text
commitment = Poseidon(secret, nullifier, recipientHash)  ← V3: bound here
nullifierHash = Poseidon(nullifier)
recipientHashOut = recipientHash  (public output for on-chain check)
index = Σ pathIndices[i] * 2^i    ← V3.1: leaf position, public output

Merkle membership: commitment ∈ MerkleTree(root)
Binary constraint: pathIndices[i] ∈ {0, 1}
```

`index` is derived entirely from the `pathIndices[]` bits the circuit
already computed to prove Merkle membership — no new private inputs. It
reveals only the deposit's position in the Merkle tree (depth-20), no more
sensitive than the commitment list itself, already fully public on-chain.

**Public inputs** (visible on-chain): `root`, `nullifierHash`,
`recipientHash`, `index`.

**Private inputs** (never leave the browser): `secret`, `nullifier`,
`recipientHash`, `pathElements[20]`, `pathIndices[20]`.

### Trusted Setup

The V3.1 circuit's Groth16 proving/verification keys reuse the same
publicly available Powers of Tau file (Hermez/Polygon ceremony) as the
original V3 setup, followed by a new circuit-specific phase-2
contribution (V3.1's R1CS differs from V3's). This is the same
trusted-setup pattern used by most hackathon and early-stage Groth16
deployments; it is **not** a multi-party, audited ceremony. A production
deployment would require a dedicated, publicly-verifiable phase-2 MPC
ceremony before handling real funds.

### Circuit Evolution

| Version | Commitment | Recipient Binding | Deposit-Amount Aware | Status |
|---|---|---|---|---|
| V1 (square) | N/A | N/A | N/A | Verifier pipeline test |
| V2 (note) | `Poseidon(secret, nullifier)` | Contract-level only | No | Deprecated |
| V3 | `Poseidon(secret, nullifier, recipientHash)` | Circuit-level | No | Deprecated |
| V3.1 | `Poseidon(secret, nullifier, recipientHash)` | Circuit-level | **Yes** | Deprecated |
| V4 (current) | `Poseidon(secret, nullifier, recipientHash)` | Circuit-level | **Yes** | ✅ Active (depth-20) |
