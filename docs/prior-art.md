# Prior Art and What Makes Growthip Distinctive

> Part of the Growthip documentation set. See the [root README](../README.md) for the project overview.

---

## Prior Art and How Growthip Differs

Growthip builds on the Stellar ecosystem's open privacy primitives. The most
advanced open-source reference is:

**NethermindEth/stellar-private-payments (SPP)** — an SDF-promoted,
proof-of-concept privacy-payments system using Soroban pool contracts,
Circom + Groth16, browser-based WASM proving, UTXO-style note semantics, and
Association Set Providers (ASPs) for membership/non-membership compliance
controls. SPP is explicitly a research PoC: not audited, not intended for
production use with real assets. The earliest Stellar privacy-pool prototypes
(e.g. the original SDF research example) used BLS12-381; the Stellar ZK
ecosystem has since converged on BN254 via the Protocol 25/26 host functions.

Growthip acknowledges SPP as an architectural predecessor and shares its broad
shape (a shielded Soroban pool with Circom/Groth16 proofs). It is built on the
same **BN254 / Protocol 25/26** foundation rather than competing on curve
choice. Where Growthip differs is in design intent and several concrete
mechanisms:

1. **Creator-tipping focus, not general payments** — SPP targets general
   private transfers and institutional compliance (ASP membership gating).
   Growthip is a complete tipping product: shareable creator tip links
   (`/tip/[id]`), QR codes, a busy-creator claim dashboard, and a
   self-sustaining premium model — not a general-purpose framework.
2. **V3 circuit recipient binding** — `commitment = Poseidon(secret, nullifier, recipientHash)`
   binds the recipient at circuit level, not just contract level, preventing
   recipient substitution even if the note is stolen.
3. **V3.1 circuit deposit-amount binding** — the circuit additionally exposes
   the deposit's Merkle leaf `index` as a public output, letting the pool pay
   out the *actual* amount deposited (1x/5x/10x/20x the base unit) instead
   of a flat base unit — see [Security History](#security-history-honest-disclosure)
   for how a real bug here was found and fixed via a live testnet transaction.
4. **End-to-end encrypted note delivery** — X25519 ECDH + AES-GCM, with the
   creator's encryption identity protected by a password *and* an
   independent recovery phrase, never the wallet's own Stellar key (which
   no Freighter-class wallet exposes for this purpose).
5. **Private deposit()** — prevents free commitment spam (a griefing vector).
6. **On-chain trustless root history** — the Merkle root is recomputed
   on-chain via the native Poseidon host function on every deposit, and
   claims are validated against a bounded on-chain root history. No admin
   ever sets or signs off on the root.
7. **pool upgrade()** — enables protocol upgrades without losing state.

These are differences in application design and circuit-level guarantees, not
claims of cryptographic superiority over SPP. Both are early-stage,
testnet/PoC-grade systems; Growthip's contribution is showing this privacy
pattern working end-to-end for a specific consumer use case, with 37 passing
tests across an 8-crate contract workspace.

## What Makes Growthip Distinctive

Growthip combines several capabilities that, together, are uncommon on Stellar
today. Rather than claim primacy on the underlying primitives (the BN254
verifier and on-chain Poseidon Merkle tree are now shared building blocks used
by SPP and others), Growthip's distinctive combination is:

* ✅ A native Groth16 BN254 verifier built on Protocol 25/26 host functions
* ✅ An on-chain Poseidon Merkle tree — root recomputed natively on-chain via
  the `poseidon_permutation` host function on every deposit, not admin-submitted
* ✅ ZK Merkle membership proofs applied to a working **creator tipping** flow
* ✅ A complete deposit → note → proof → claim cycle verified on Stellar Testnet
* ✅ `recipientHash` binding at circuit level (V3) — not just contract level
* ✅ A ZK-circuit-derived deposit index (V3.1) so claims pay out the actual
  amount deposited, while keeping the depositor's identity private
* ✅ On-chain ZK privacy combined with end-to-end encrypted off-chain note
  delivery, gated by a self-sustaining on-chain premium model

The novel contribution is not any single primitive but this end-to-end
combination, delivered as a usable tipping product rather than a framework.

CAP-0075: Cryptographic Primitives for Poseidon/Poseidon2 Hash Functions defines host functions that expose the core permutation primitives behind Poseidon and Poseidon2, addressing a key performance bottleneck for hashing inside ZK-friendly applications, shipped in Protocol 25 (X-Ray). CAP-0080 in Protocol 26 (Yardstick) builds on the BN254 work from X-Ray, adding nine new host functions for BN254 multi-scalar multiplication, scalar-field arithmetic, and curve-membership checks. Growthip uses the Poseidon host function directly to compute its Merkle root on-chain — not just to verify a Groth16 proof, but to eliminate the need for any admin-submitted root entirely.
