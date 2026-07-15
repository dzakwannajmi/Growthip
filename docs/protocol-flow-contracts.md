# Protocol Flow — Soroban Contracts

> Part of the Growthip documentation set. See the [root README](../README.md) for the project overview.

> This is the **contract-side half** of the end-to-end flow. For what
> happens in the browser before a transaction ever reaches these
> contracts (note encryption, ZK proof generation), see
> [docs/protocol-flow-frontend.md](protocol-flow-frontend.md).

---

## Contract Flow Diagram

```mermaid
graph TD
    subgraph Contracts ["STELLAR SOROBAN CONTRACTS"]
        direction TB

        subgraph Pool ["GrowthipPool - deployed per token"]
            direction TB
            P1["Receive deposit_paid\ncommitment + amount + message"]
            P2["Store commitment on-chain\nanonymously - no identity link"]
            P3["Recompute Merkle root\nvia Poseidon host function"]
            P4["Append root to bounded\non-chain root history"]
            P5["Store encrypted bundle\nin message field - max 2048 bytes"]
            P1 --> P2 & P3 & P4 & P5
        end

        subgraph Claim ["Claim Verification - fail-fast order"]
            direction TB
            V1["1. Root present in on-chain history?"]
            V2["2. Nullifier not yet used?"]
            V3["3. Groth16 proof valid? BN254 Protocol 25/26"]
            V4["4. recipientHash matches registry?"]
            V5["5. Lookup actual deposit amount via index"]
            V6["6. Transfer 99% to creator\n1% accrues as platform fee"]
            V7["7. Mark nullifier as used forever\ndouble-claim impossible"]
            V1 --> V2 --> V3 --> V4 --> V5 --> V6 --> V7
        end

        subgraph Verifier ["GrowthipMerkleVerifierV4"]
            direction TB
            VR1["verify proof_bytes + public_inputs"]
            VR2["BN254 multi-scalar multiplication\n+ pairing check via Protocol 25/26 host fns"]
            VR1 --> VR2
        end

        subgraph Registry ["GrowthipCreatorRegistry - global, deployed once"]
            direction TB
            RG1["register_encryption_pubkey\n6 XLM one-time activation"]
            RG2["is_premium + get_encryption_pubkey"]
            RG3["withdraw_fees - admin-gated batch"]
        end

        Pool --> Claim
        Claim --> Verifier
    end

    Browser(["Browser / Frontend\n(full diagram: docs/protocol-flow-frontend.md)"]) -- "Freighter signing + Soroban RPC" --> Contracts
    ZKProof(["ZK Circuit proof\n(full diagram: docs/protocol-flow-frontend.md)"]) -- "Groth16 proof + public inputs" --> Claim
    Registry -- "Encryption pubkey on-chain" --> Browser

    classDef default fill:#ffffff,stroke:#D4D4D4,stroke-width:1.5px,color:#171717
    classDef external fill:#F1F5F9,stroke:#94A3B8,stroke-dasharray: 4 3,color:#475569
    class Browser,ZKProof external
    style Contracts fill:#FFF7ED,stroke:#FED7AA
    style Pool fill:#FFFBEB,stroke:#FDE68A
    style Claim fill:#FEF2F2,stroke:#FECACA
    style Verifier fill:#F0FDF4,stroke:#BBF7D0
    style Registry fill:#EFF6FF,stroke:#BFDBFE
````

---

## Contract Call Sequence

Growthip implements a **fixed-denomination privacy pool** model:

1. **Supporter calls `deposit_paid(commitment, amount, message?)`**
   * → tip locked in pool (1x/5x/10x/20x base denomination)
   * → commitment stored on-chain (anonymous — no identity link)
   * → an optional **encrypted bundle** (max 2048 bytes) is stored on-chain
     as the `message` field — the supporter's browser encrypts the private
     note *before* depositing, so the creator can auto-fetch and decrypt it
     without any manual copy-paste. A plain public donor message (max 50 chars,
     legacy) is also supported as a fallback
   * → **the pool recomputes its Merkle root on-chain**, using the native
     Poseidon host function, and appends the new root to an on-chain
     bounded root history
2. **Supporter's browser encrypts the private note for the creator**
   * → note contains: `secret`, `nullifier`, `recipientHash`, Merkle
     path, the V3.1 `index`
   * → encrypted with X25519 ECDH + AES-GCM against the creator's
     published encryption public key (`growthip-creator-registry`) —
     only the creator's browser, holding the matching private key, can
     decrypt it
   * → the encrypted bundle is shared via the tip link's resulting
     screen, as text or a QR code
3. **Creator calls `register_recipient(recipient, recipient_hash)`**
   * → binds their wallet to their expected `recipientHash`
   * → done automatically the first time a creator connects their wallet
     to the dashboard, on every available token pool
4. **Creator's browser decrypts the note, then generates a Groth16
   proof from it**
   * → proof proves: valid note + Merkle membership + unused nullifier +
     the deposit's leaf index (V3.1)
5. **Creator calls `claim_to(recipient, proof_bytes, public_inputs)`**
   * → contract verifies, in order: **root is present in on-chain root
     history** → nullifier unused → proof valid → recipient hash match
   * → looks up the deposit's *actual* amount via the proof's index output
   * → 99% of that actual tip amount transferred to creator, 1% accrues
     as platform fee (see [Fee Model](#fee-model))
   * → nullifier marked as used (forever)

---

## ### What Is Public
* ✅ Deposit timestamps
* ✅ Withdrawal timestamps
* ✅ Pool balance
* ✅ Total deposits / total claims
* ✅ Commitment list (anonymous — not linked to identity)
* ✅ Used nullifier list (anonymous — not linked to secret)
* ✅ Root history (anonymous — just a list of hashes, not linked to depositors)
* ✅ A deposit's optional on-chain message field (encrypted bundle or plain donor message — stored on-chain, max 2048 bytes, not linked to the depositor's identity)
* ✅ A premium creator's encryption public key (necessary for supporters
  to encrypt notes — a public key, not a secret)

### What Is Protected
* 🔒 Link between supporter wallet and creator wallet
* 🔒 Tip amount granularity (within a fixed denomination tier — all deposits
  at a given tier are identical)
* 🔒 Secret and nullifier preimage (never leave the browser)
* 🔒 The private note's contents in transit (end-to-end encrypted, once
  the creator has activated premium)

### Known Limitations
* ⚠️ Deposit and withdrawal timestamps are public — timing correlation is possible
* ✅ Large anonymity set — depth-20 incremental Merkle tree (2^20 = 1,048,576 leaves per pool). Only frontier nodes stored on-chain; 20 Poseidon calls per deposit regardless of tree size. No pool redeployment needed as deposits grow.
* ⚠️ Private note encryption is opt-in and paid (6 XLM) — a creator who
  hasn't activated it cannot receive tips at all, rather than receiving
  them with weaker privacy. See [SECURITY.md](SECURITY.md) for the full
  trust-model writeup, including key-loss and recovery trade-offs
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
