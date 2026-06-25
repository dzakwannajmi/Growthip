# Growthip Demo Script

> Target duration: 3-5 minutes.

---

## 1. Opening

Growthip is a privacy-preserving creator tipping protocol built on Stellar Soroban.

**The problem:** Every blockchain payment is public. When you tip a creator on-chain, the link between your wallet and theirs is permanently visible to anyone.

**Growthip's solution:** Supporters deposit into a shared pool. Creators claim using a Groth16 zero-knowledge proof. The on-chain record shows two events — a deposit and a claim — but cannot link which deposit belongs to which claim.

---

## 2. Live Demo Flow

### Step 1 — Creator Setup (one-time)
1. Creator connects wallet at growthip.vercel.app/dashboard
2. Activate Premium (6 XLM one-time) — generates X25519 encryption keypair
3. Public key published on-chain via growthip-creator-registry
4. Creator shares their tip link: growthip.vercel.app/tip/<id>

### Step 2 — Supporter Sends a Tip
1. Supporter opens the tip link — no account needed
2. Connect Freighter or xBull wallet
3. Select token (XLM or USDC) and amount
4. Browser-side: encrypts private note with creator's on-chain public key (X25519 ECDH + AES-GCM)
5. deposit_paid(commitment, amount, encrypted_bundle) — encrypted note stored on-chain as message field (max 2048 bytes)
6. Pool recomputes Merkle root on-chain via native Poseidon host function

### Step 3 — Creator Claims
1. Creator opens /dashboard/activity
2. Dashboard auto-fetches encrypted bundles from on-chain message fields
3. Creator unlocks with password — browser decrypts note
4. Browser generates Groth16 ZK proof (BN254, Circom WASM) from the note
5. claim_to(recipient, proof_bytes, public_inputs) — contract verifies:
   - Root present in on-chain root history
   - Nullifier not yet used
   - Proof valid (native BN254 Protocol 25/26 host functions)
   - recipientHash matches registry
6. 99% of tip transferred to creator, 1% accrues as platform fee
7. Nullifier marked used forever — double-claim impossible

---

## 3. What Is Public On-Chain
- Deposit timestamps and amounts (within fixed denomination tiers)
- Withdrawal timestamps
- Pool balance and total deposits/claims
- Commitment list (anonymous — not linked to identity)
- Used nullifier list (anonymous)
- Encrypted bundle in message field (ciphertext only — not readable without creator's private key)

## 4. What Is Protected
- Link between supporter wallet and creator wallet
- Secret and nullifier preimage
- Private note contents in transit (end-to-end encrypted)

---

## 5. Contract Addresses (Stellar Testnet)

| Contract | Address |
|---|---|
| Verifier V3.1 | CA5IHK2NAUVQ6NLS7CWSGPZWEXY6CAFAQBLMM43GCKSFYC2BZXZQIA2L |
| Pool XLM | CAXQ3JMCPRQH5FGDVY36BHZEYHREMXE56SZSTJN3Y4VIK337EJC44DQW |
| Pool USDC (Circle) | CBUPHDORLRNQWH2WWLZFN5TX2XM74EEFELAZJY3Z3YOPUMCCMZTMQSEG |
| Creator Registry | CDX52ACO6MVXDBC4IS3AG6NIKQASJLY24BED3S5KJEA4PPPAXTWSRGNU |
| USDC Token (Circle) | CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA |

---

## 6. ZK Circuit V3.1

Private inputs : secret, nullifier, recipientHash, pathElements[3], pathIndices[3]
Public outputs : root, nullifierHash, recipientHashOut, index

commitment    = Poseidon(secret, nullifier, recipientHash)
nullifierHash = Poseidon(nullifier)
index         = leaf position from pathIndices bits (deposit-amount-aware claims)

Merkle membership: commitment in MerkleTree(root), depth-3, 8 leaves

index lets the pool pay out the actual deposited amount (1x/5x/10x/20x base) instead of always a flat base unit — fixing a real bug found during testnet testing.

---

## 7. Test Results

cargo test --workspace

Total: 37 passed, 0 failed, 3 ignored

3 ignored tests predate the root-history fix and carry explicit #[ignore] annotations explaining why.

---

## 8. Known Limitations (Honest)

- Testnet only — not audited, not production-ready
- Anonymity set max 8 leaves per pool (depth-3 tree) — incremental depth-20 tree planned for Phase 4
- Timing correlation possible (deposit and withdrawal timestamps are public)
- Trusted setup is a standard snarkjs ceremony, not a public multi-party one
- Creator's real wallet address revealed on-chain at claim time

---

## 9. Closing

Growthip demonstrates a complete, working, end-to-end privacy-preserving tipping flow on Stellar — from browser-side ZK proof generation to on-chain BN254 verification — shipped as a usable product, not just a framework.

Live: growthip.vercel.app
