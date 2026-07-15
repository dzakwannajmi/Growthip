# Growthip 🌱
### Privacy-Preserving Creator Tipping on Stellar

> *Support creators without exposing the relationship.*

[![Demo Video](https://img.shields.io/badge/▶_Demo_Video-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/o_RsWAA1OV8)
[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-growthip.vercel.app-000000?style=for-the-badge)](https://growthip.vercel.app)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge)](LICENSE)
[![Stellar Testnet](https://img.shields.io/badge/Stellar-Testnet-7D00FF?style=for-the-badge&logo=stellar&logoColor=white)](https://stellar.org)

Growthip is a privacy-preserving creator tipping protocol built on **Stellar Soroban**, using **Groth16 zero-knowledge proofs** with **native BN254 verification** (Stellar Protocol 25/26), plus **end-to-end encrypted note delivery** so the claim data needed to unlock a tip never travels in plaintext.

A supporter deposits a fixed-denomination tip into a shared pool. The creator later claims it using a ZK proof. The public chain records both events — but cannot trivially link which deposit corresponds to which claim.

```text
supporter deposits → pool stores commitment → on-chain root updates
note encrypted     → only the creator's browser can decrypt it
creator claims     → ZK proof verifies note membership + deposit amount
nullifier consumed → double-claim prevented forever
```

> ⚠️ Hackathon prototype. Stellar Testnet only. Not audited. Do not use with real funds.
>
> ℹ️ **Current UI status:** only **XLM** tipping is active in the deployed
> frontend. The USDC pool is deployed and functional on-chain, but its
> transfer/deposit UI is temporarily disabled while an unresolved bug in
> the (experimental, separate) V5 shielded claim flow is investigated —
> see [docs/roadmap.md](docs/roadmap.md). EURC/IDRT remain roadmap items,
> not yet deployed.

---

## Documentation Index

This README is intentionally short. Everything else lives in focused,
linkable docs — start here:

| Document | What's in it |
|---|---|
| **[docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)** | 3–5 minute demo walkthrough script — start here if you're evaluating this project |
| **[docs/protocol-flow-contracts.md](docs/protocol-flow-contracts.md)** | Contract-side flow: Pool → Claim verification → Verifier → Registry, what's public vs. protected, known limitations |
| **[docs/protocol-flow-frontend.md](docs/protocol-flow-frontend.md)** | Browser-side flow: note encryption, Merkle path, ZK proof generation — all client-side, no backend |
| **[docs/testnet-deployment.md](docs/testnet-deployment.md)** | All deployed contract addresses (V5 active + V4 deprecated), tip amounts, network params |
| **[docs/zk-circuit.md](docs/zk-circuit.md)** | Circuit design, public/private inputs, trusted setup, circuit version history (this doc's own V4-specific claims weren't re-verified this session — worth a separate pass) |
| **[docs/fee-model.md](docs/fee-model.md)** | How the 1% platform fee and 6 XLM premium activation fee work, on-chain |
| **[docs/creator-experience.md](docs/creator-experience.md)** | Shareable tip links, QR codes, premium private notes & analytics |
| **[docs/prior-art.md](docs/prior-art.md)** | How Growthip compares to prior Stellar privacy-pool work (SPP) and what's distinctive |
| **[docs/responsible-privacy.md](docs/responsible-privacy.md)** | Why this project exists and the responsible-privacy framing |
| **[docs/roadmap.md](docs/roadmap.md)** | Phase 1–5 roadmap, what's shipped vs. planned |
| **[SECURITY.md](SECURITY.md)** | Threat model, trust assumptions, full write-ups of every self-found issue with on-chain evidence |
| **[apps/web/README.md](apps/web/README.md)** | Frontend stack, key library files, env vars, CSP config |
| **[contracts/README.md](contracts/README.md)** | Full 8-crate contract workspace, build/test/deploy workflow |

---

## Live Demo
* **URL:** [https://growthip.vercel.app](https://growthip.vercel.app)
* **Network:** Stellar Testnet
* **Wallet:** Freighter / xBull (via Stellar Wallets Kit)

---

## Protocol Flow

```text
BROWSER (client-side only, no backend)          SOROBAN CONTRACTS
─────────────────────────────────────          ──────────────────
Supporter encrypts note + generates
commitment, calls deposit_paid()        ──────▶ Pool stores commitment,
                                                 recomputes Merkle root
                                                 on-chain, appends to
                                                 root history

Creator decrypts note, generates a
Groth16 ZK proof in-browser (WASM),     ──────▶ Claim verifies: root in
calls claim_to()                                history → nullifier
                                                 unused → proof valid →
                                                 recipient hash match →
                                                 pays out actual deposit
                                                 amount → nullifier burned
```

Full diagrams and detail, split by side to stay readable:
* **[docs/protocol-flow-frontend.md](docs/protocol-flow-frontend.md)** — what runs in the browser (note encryption, Merkle path, proof generation)
* **[docs/protocol-flow-contracts.md](docs/protocol-flow-contracts.md)** — what runs on Soroban (pool, claim verification, verifier, registry) + what's public vs. protected

---

## Security History (Honest Disclosure)

Growthip's design changed materially during development after **three
self-found and self-fixed critical/low-severity issues** (root-validation
forgery, a verifier interface leak, and a deposit-amount payout bug), plus
a V4 verifier test-coverage gap found and closed before any production
impact was possible. Every issue is documented with exact attack steps,
fixes, and on-chain transaction evidence — not just claimed — in
**[SECURITY.md](SECURITY.md)**, which also covers the full threat model,
trust assumptions, and the private-note encryption system's trust
boundaries.

> ⚠️ Not audited. Testnet only. Do not use with real funds.

---

## Soroban Contracts

See [contracts/README.md](contracts/README.md) for the full,
contract-by-contract structure, build/test/deploy workflow, and the
complete workspace member table (8 crates). Summary of the active
production contracts:

### GrowthipPool
Escrow and claim logic. Deployed once per token. Validates the claim's
root against on-chain history, the nullifier, the Groth16 proof, the
recipient hash, and the proof's `index` output (used to look up the
actual deposited amount) — in that order, fail-fast before the expensive
pairing check runs.

### GrowthipMerkleVerifierV4 — Deprecated
Native Soroban Groth16 verifier using Protocol 25/26 BN254 host
functions (`verify(proof_bytes, public_inputs) -> bool`). Compatible with V4 circuit (depth-20, 5400 non-linear constraints, pot14 trusted setup). **No longer used by the frontend** — superseded by the in-process `verifier-v5` library described in `contracts/README.md`. The corresponding `growthip-merkle-verifier` crate still exists on disk but is not a workspace member (see `contracts/README.md`).

### GrowthipCreatorRegistry
Global, deployed-once creator identity: encryption public key and
premium activation status, independent of which token pool(s) a creator
receives tips through.

### Test Coverage

```bash
cargo test --workspace
```

```text
Total: 38 passed, 0 failed, 5 ignored (across all 8 workspace crates)
```

The ignored tests predate the root-history fix and relied on the
absence of root validation to pass — each carries an `#[ignore = "..."]`
reason explaining exactly why, rather than being silently deleted. See
[SECURITY.md](SECURITY.md) and
[contracts/README.md](contracts/README.md#test) for the full breakdown.

---

## Project Structure

```text
growthip/
├── apps/
│   └── web/                              # Next.js 16 frontend — see
│                                          # apps/web/README.md for the
│                                          # full file-by-file breakdown
├── circuits/
│   ├── src/
│   │   └── transaction2x2.circom         # Active V5 circuit — 2-in/2-out
│   │                                      # JoinSplit, Poseidon2, 62,807
│   │                                      # constraints
│   ├── lib/poseidon2/                    # Poseidon2 circom components
│   │                                      # (parity-tested against
│   │                                      # contracts/poseidon2)
│   ├── growthip_merkle_note_v4.circom     # Deprecated — old V4 circuit
│   └── growthip_merkle_note_v3_1.circom  # Deprecated — superseded by V4,
│                                          # itself now superseded by V5
├── contracts/                            # 5-crate Cargo workspace — see
│                                          # contracts/README.md
│   ├── pool-v5/
│   ├── verifier-v5/
│   ├── poseidon2/
│   ├── zk-types/
│   ├── growthip-creator-registry/
│   └── growthip-merkle-verifier/         # orphaned — not a workspace
│                                          # member, deprecated V4 leftover
├── docs/                                 # Protocol docs — see the table
│                                          # further down this README
├── scripts/                              # Circuit input generation,
│                                          # proof conversion, constant
│                                          # extraction
├── packages/                             # Generated TypeScript contract
│                                          # bindings
└── .env.example                          # Environment variable template
```

---

## Local Development

### Requirements
* Node.js 18+
* Rust + cargo
* Stellar CLI 26+
* Freighter or xBull Wallet (browser extension)
* circom 2.1.6+
* snarkjs

### Setup

```bash
git clone https://github.com/dzakwannajmi/Growthip
cd growthip

npm install

cp apps/web/.env.example apps/web/.env.local
# Fill in contract addresses (see Testnet Deployment section in README)
```

### Run Frontend

```bash
cd apps/web
npm run dev
# Open http://localhost:3000
```

See [apps/web/README.md](apps/web/README.md) for environment variables,
the full key-library-file breakdown, and CSP configuration.

### Run Tests

```bash
cargo test --workspace
```

See [contracts/README.md](contracts/README.md) for per-crate test
commands and the build/deploy workflow.

---

## Roadmap Snapshot

Phases 1–3 (hackathon MVP, creator profiles/sharing, encrypted note
delivery + premium) are **shipped**. Phase 4 (production hardening —
formal audit, public trusted-setup ceremony, nonce-based CSP) and Phase 5
(creator platform expansion) are planned. Full phase-by-phase breakdown,
including exactly what's done vs. pending in each: **[docs/roadmap.md](docs/roadmap.md)**.

---

## Prototype Notice

Growthip is a hackathon/testnet prototype.

* Not audited
* Not production-ready
* Trusted setup is a standard local snarkjs ceremony, not a
  public multi-party one
* Private note encryption is opt-in, paid, and has no server-side
  recovery path if both the password and recovery phrase are lost
* Depth-20 incremental Merkle tree deployed (2^20 = 1,048,576 leaves per pool) — no pool redeployment needed
* Merkle root is NOT admin-controlled — computed on-chain natively
* Honest about all limitations, including three self-found vulnerabilities
  and their fixes (see [SECURITY.md](SECURITY.md))
* Testnet only — no real funds at risk

---

## License

Apache License 2.0 — Muhammad Dzakwan Najmi. See [LICENSE](LICENSE) for the full text.
