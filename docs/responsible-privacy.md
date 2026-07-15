# Why Growthip & Responsible Privacy

> Part of the Growthip documentation set. See the [root README](../README.md) for the project overview.

---

## Why Growthip

On every public blockchain, every payment is permanent and visible:

```text
supporter wallet → creator wallet → amount → timestamp
```

For creators and supporters, this creates real friction:

* A donor cannot support a controversial creator without public association
* An open-source maintainer cannot receive donations without exposing income
* A student builder cannot accept community support without family judgment
* A community admin cannot reward contributors without triggering social dynamics

Growthip solves this with a ZK privacy pool: supporters deposit into a shared pool, share an encrypted note off-chain, and creators claim using a zero-knowledge proof. The on-chain link between supporter and creator is cryptographically broken, and the claim data itself travels encrypted, not as plaintext.

**This is not a mixer.** Growthip is an application-specific tipping protocol for creator support, with fixed small denominations, recipient registration, and honest compliance framing.

---

## Responsible Privacy

Growthip is built for creator support, not for financial opacity.

The pool contract is fully transparent — every deposit and withdrawal is visible on-chain. What Growthip protects is the personal link between supporter and creator, and the claim data needed to unlock a tip, because that relationship and that data should be private by default — just like a tip in a jar does not record your name.

* ✅ Fixed denomination tiers — economically impractical for money laundering
* ✅ Recipient registration required — accountable claim flow
* ✅ Testnet only — no real assets
* ✅ Not a general-purpose mixer — application-specific tipping only
* ✅ All limitations documented honestly, including three self-found and
  self-fixed critical vulnerabilities (root validation, verifier
  interface leak, deposit-amount payout) and the trust-model trade-offs
  of the encryption system — see [SECURITY.md](SECURITY.md)

**Why privacy is legitimate:**
When you tip a street musician, nobody records your name. When you support a creator in person, there is no public ledger. Growthip brings this natural privacy to blockchain-based creator support — without hiding the pool itself, and without compromising auditability of the protocol.
