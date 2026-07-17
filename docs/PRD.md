# Product Requirements Document (PRD) — Growthip

**Repository**: [https://github.com/dzakwannajmi/Growthip](https://github.com/dzakwannajmi/Growthip)
**Status**: V4 (public tipping) fully functional on Stellar Testnet. V5 (shielded/private tipping) in active development — send & claim currently working for XLM; USDC pool has a known issue under investigation.

---

## 1. Project Overvieww

### Application Name

**Growthip** — Privacy-Preserving Creator Tipping Protocol on Stellar.

### Problem Background

Financial support platforms for content creators (Patreon, Ko-fi, Buy Me a Coffee, and similar) generally rely on centralized payment providers — meaning a third party stores transaction data, charges significant fees, and can unilaterally freeze funds or creator accounts. On the other hand, public blockchains like Stellar eliminate centralized intermediaries, but create a new problem: **every transaction is permanently recorded and visible to anyone** — including who supports whom, and the exact amount. For many supporters, this total transparency is a barrier: they want to support creators without having their identities publicly linked to the activity.

Growthip is built to address both problems simultaneously: eliminating centralized intermediaries (funds are completely on-chain, non-custodial) **and** concealing the link between sender and receiver using zero-knowledge (ZK) proofs.

### Target Users

1. **Content creators** (streamers, writers, artists, educators) who want to receive financial support from their audience without centralized intermediaries, with privacy options for their supporters' identities.
2. **Supporters/fans** who want to support their favorite creators directly and quickly, with the option to hide their support activity from public on-chain records.

---

## 2. User Personas & User Flow

### Actors (Personas)

| Actor | Description |
| --- | --- |
| **Creator** | Owner of the tip link (`/tip/[id]`), receives funds, can create campaigns, enable private notes, and view the dashboard & revenue analytics. |
| **Supporter** | A visitor who sends a tip via the creator's link/QR code. Requires no account registration — just a Stellar wallet. |
| **Admin (contract level)** | Not an in-app role (no admin dashboard), but the wallet that deploys and initializes Soroban contracts (pool, verifier, registry) on the testnet. |

### User Flow — Creator

1. Open Growthip → connect Stellar wallet (Freighter/xBull).
2. The Dashboard automatically displays a personal tip link (`/tip/{encodedAddress}`) and QR code.
3. (Optional) Create a campaign with a funding goal & deadline on the Links page.
4. (Optional) Enable **Private Notes** — set up an encryption identity (password + 12-word recovery phrase) so incoming messages/tips are end-to-end encrypted.
5. (Optional, V5) Set up a **`gr` (shielded)** identity — a separate 12-word mnemonic — then register its encryption key on-chain per token pool, allowing them to receive fully private tips (amount & sender hidden).
6. Monitor balances, tokens, and history on the Dashboard; view revenue trends in Analytics.
7. Claim incoming tips (V4: manual claim per-note from Activity; V5: notes are auto-detected via on-chain scanning using the `ivk` key and are ready to be claimed).

### User Flow — Supporter

1. Open the creator's tip link (directly from the creator, or by scanning the QR code).
2. Select a token (XLM/USDC) and amount (preset or custom).
3. Connect wallet, confirm transaction.
* **V4 Route (public)**: the deposit is recorded directly to the pool smart contract, linked to a commitment that the creator will later claim via a Merkle proof.
* **V5 Route (shielded)**: the creator's `gr1...` address is used for note encryption (amount & data hidden via Groth16 ZK proof), with no sender↔receiver link visible on the public ledger.


4. (Optional) Include an encrypted private message if the creator has enabled Private Notes.
5. Transaction complete — no account needed, no installation required other than a wallet extension.

---

## 3. Functional Requirements

| Feature ID | Feature Name | Behavioral Description | Status |
| --- | --- | --- | --- |
| FR-01 | Wallet Connect | Connect a Stellar wallet (Freighter/xBull) as the login identity, without an account/email/password. | Mandatory |
| FR-02 | Tip Link & QR Code | Each creator automatically receives a unique tip link (`/tip/[id]`) and a shareable QR code. | Mandatory |
| FR-03 | Send Tip (V4, public) | Supporter sends XLM/USDC/EURC to the smart contract pool; the commitment is stored in an on-chain Merkle tree. | Mandatory |
| FR-04 | Claim Tip (V4) | Creator claims funds from the pool using a ZK proof (proof of note ownership, without revealing note contents publicly) via the V4 Verifier. | Mandatory |
| FR-05 | Campaign | Creator sets up a campaign page with a funding target & deadline, shared via a special link. | Mandatory |
| FR-06 | Private Notes (V4) | End-to-end encryption of messages/tip metadata (X25519 ECDH + AES-GCM) that only the creator can unlock; premium feature, one-time activation fee. | Optional |
| FR-07 | Dashboard | Displays balances, token list, and a summary of the creator's recent activity. | Mandatory |
| FR-08 | Analytics | Revenue trend graphs (sparkline & area chart) per period and per token, average tip breakdown. | Mandatory |
| FR-09 | Display Currency | Displays balance/revenue values in USD or IDR based on user preference. | Optional |
| FR-10 | Dark/Light Theme | Toggle dark/light appearance across the entire application. | Optional |
| FR-11 | `gr` Shielded Identity (V5) | Setup/restore a private identity based on a separate 12-word mnemonic (Baby Jubjub keypair), independent of the V4 Private Notes identity. | Optional |
| FR-12 | Register `gr` Key On-Chain | Register the creator's public encryption key (`pkD`) to the V5 pool contract, per token, so it can be discovered by supporters. | Optional |
| FR-13 | Send Shielded Tip (V5) | Supporter sends a fully private tip (amount & sender-receiver link hidden) via a client-side Groth16 proof. **Current status: functional for XLM; USDC is still under repair.** | Optional (partially functional) |
| FR-14 | Shielded Note Detection & Claim (V5) | Scanning of on-chain events and automatic decryption attempts (trial-decrypt) using the creator's `ivk` to discover incoming tips, then claim them. | Optional |

---

## 4. Non-Functional Requirements

### Technology (Stack)

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (Turbopack), React 19, TypeScript (strict mode), Tailwind CSS |
| Wallet Integration | Freighter API, xBull, `@stellar/stellar-sdk` |
| Smart Contract | Rust, Soroban SDK (`soroban-sdk` 26.x), deployed to Stellar Testnet |
| Zero-Knowledge Proof | Circom 2.2.x, SnarkJS, Groth16 scheme over BN254 curve |
| Hash On-Chain | Poseidon (V4) / Poseidon2 via CAP-0075 native host function (V5) |
| Client-Side Encryption | X25519 ECDH + AES-GCM + Argon2id (V4 Private Notes); Baby Jubjub ECDH + XChaCha20-Poly1305 (V5 shielded notes) |
| Client Storage | IndexedDB (encrypted identity, non-extractable session key), localStorage (preferences, campaign metadata) |

### Security Provisions

* **Non-custodial**: Growthip never stores private keys or user funds on any server — all fund custody relies on on-chain smart contracts.
* **No centralized backend/database**: There is no server storing user data; all state lives on-chain or entirely within the user's browser (see Section 5).
* **ZK input validation**: All public proof inputs (root, nullifier, commitment, amount) are canonically validated (`< field prime`) inside the contract before proof verification is accepted, preventing encoding manipulation.
* **Layered encryption for private identity**: Private keys are never stored in plaintext; only wrapped versions (AES-GCM, Argon2id derived key from password) are persisted in IndexedDB. Unwrapped session keys are non-extractable and automatically lock after a period of inactivity (auto-lock).
* **Identity separation**: The recovery mnemonic for Private Notes (V4) and the shielded `gr` identity (V5) are intentionally built to be independent of each other — compromising one does not grant access to the other.
* **Internal audit**: All smart contracts and ZK circuits undergo unit testing + adversarial testing (double-spend, forged proof, overflow amount, etc.) prior to deployment; the history of internal bug findings is openly documented.

### Current Limitations (Known Limitations)

* The application runs on the **Stellar Testnet**, not Mainnet — it is not yet intended for real funds.
* The V5 ZK circuit trusted setup is currently single-contributor (has not undergone a multi-party MPC ceremony) — this must be updated before production.
* The shielded tip delivery route (V5) for the **USDC token is currently experiencing issues**; XLM is fully functional (send & claim).

---

## 5. Database Schema

Growthip **intentionally does not have a traditional backend database** — this is a core architectural decision, not a limitation. All data that typically lives in a relational/NoSQL database in conventional applications is split into the following two categories in Growthip.

### 5.1 On-Chain State (Soroban Smart Contract Storage)

**Pool Contract** (V4 & V5, one instance per token):

| Key/Field | Type | Description |
| --- | --- | --- |
| `admin` | `Address` | Contract admin/deployer wallet. |
| `token` | `Address` | Stellar Asset Contract (SAC) address of the token served by this pool. |
| Merkle tree (root history + frontier) | `U256[]` | Incremental Merkle tree structure storing tip commitments; only the root is stored on-chain, not all leaves. |
| Nullifier set | `mapping<U256, bool>` | Marks notes that have already been claimed, preventing double claims. |
| `domain` (V5 only) | `U256` | Unique anti-replay tag per pool, preventing a proof from one pool being reused in another. |
| `max_deposit`, `tvl_cap` (V5 only) | `i128` | Security limits for deposit values and total value locked. |
| Registered encryption keys | `mapping<Address, bytes32} pubkey: u32, {version:>` | Creator's public encryption keys (V4: X25519; V5: Baby Jubjub `pkD`), looked up by supporters before sending a tip. |

**Verifier Contract**: Stores the verification key (VK) resulting from the Groth16 trusted setup (baked in during compilation for V5, separate contract for V4), used to verify proofs submitted during claim/send tip transactions.

### 5.2 Client-Side Storage (Browser)

| Location | Content | Notes |
| --- | --- | --- |
| IndexedDB — `growthip-encryption-{address}` | V4 Private Notes identity: X25519 private key wrapped with AES-GCM, salt & KDF parameters. | Namespaced per wallet address. |
| IndexedDB — `growthip-gr-{address}` | V5 shielded `gr` identity: 64-byte seed wrapped with AES-GCM, `gr1...` address (plaintext, not a secret). | Totally separated from the V4 identity. |
| localStorage | Display preferences (theme, currency), campaign metadata, active wallet address, cache of previously decrypted notes. | Does not store any secret data in plaintext format. |

No user data — including transaction history, balances, or messages — is sent to or stored by Growthip servers, because **such servers do not exist**. Every balance/history query is executed directly from the browser to the Stellar RPC/Horizon in real-time.