# Roadmap

> Part of the Growthip documentation set. See the [root README](../README.md) for the project overview.

---

## Roadmap

**Phase 1 — Hackathon MVP ✅**
* Native BN254 Groth16 verifier on Soroban (Protocol 25/26)
* V3.1 circuit with cryptographic recipient binding and deposit-amount-aware
  claims
* Pool escrow with nullifier anti-double-claim
* Trustless on-chain Merkle root computation + root-history validation
* 1% platform fee with privacy-preserving batch withdrawal
* Freighter and xBull deposit + claim flow
* Testnet E2E working, including live verification of correct payout on
  multi-unit deposits
* 38 tests passing across an 8-crate contract workspace
* Vercel deployment

**Phase 2 — Creator Profiles & Sharing ✅**
* Shareable, cosmetically-obfuscated creator tip links (`/tip/[id]`)
* QR codes for tip links and claim notes
* Optional public on-chain donor messages (max 50 chars)
* Auto-registration of recipient hashes across all token pools on wallet connect
* Local creator profile (avatar, display name, bio) in Settings
* Per-address-namespaced local storage for notes and profile data

**Phase 3 — Encrypted Note Delivery, Auto-Fetch & Premium ✅**
* `growthip-creator-registry` contract — global creator identity
* X25519 ECDH + AES-GCM end-to-end note encryption
* Password + independent recovery-phrase key wrapping ("OR gate")
* Encrypted backup file export/import, session auto-lock
* 6 XLM one-time premium activation, gating private notes (mandatory once
  active) and analytics
* Strict-baseline CSP, hardened through real-world testing
* **Auto-delivery of encrypted notes via on-chain `message` field** — supporter encrypts the private note before depositing and stores the ciphertext on-chain (max 2048 bytes); creator's dashboard auto-fetches and decrypts all pending tips on load, no manual copy-paste required
* Per-pool activity filtering and filter UI (status, token, sort order)
* Pool privacy indicator with anonymity set visualization
* Encryption session badge in topbar with inline unlock
* Real-time fee breakdown with user-friendly tooltips

**Phase 4 — Production Hardening & Scalability**
* Formal security audit
* Public, multi-party trusted-setup ceremony for the V3.1 circuit
* Nonce-based CSP (removing `'unsafe-inline'`)
* ~~**Incremental Merkle tree (depth-20)**~~ — **✅ Shipped in V4!** Frontier-based incremental tree deployed. 20 Poseidon calls per deposit, 1,048,576 leaves, no pool redeployment needed.
* View key for compliance reporting
* Allowlist / eligibility gate
* Association Set Provider (ASP) integration
* Vault Mode: offline claim signing
* Hybrid on-chain key recovery, pending real usage data on backup-loss
  frequency (deliberately deferred, see SECURITY.md)

**Phase 5 — Creator Platform**
* Multiple denomination pools
* Web Worker browser proof generation
* Mobile-responsive UI polish
* Private (creator-only) donor messages, as an alternative to the public
  on-chain message — infrastructure already exists (the note encryption
  system), low marginal cost to add
