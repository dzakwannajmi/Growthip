# Fee Model

> Part of the Growthip documentation set. See the [root README](../README.md) for the project overview.

---

## Fee Model

Growthip has two fee streams, both transparent and on-chain:

**1. Per-claim fee (1%)** — calculated against the **actual amount
deposited** (not a flat base unit — see
[Security History, Issue #3](#security-history-honest-disclosure)):

* Recipient receives **99%** of the actual tip amount, transferred
  immediately on a successful `claim_to()` call
* The remaining **1%** accrues in the pool contract's storage
  (`accumulated_fees()`), withdrawn later via an admin-gated batch
  `withdraw_fees()` call — deliberately disconnected in time from any
  individual claim, to avoid linking *"who just claimed"* to *"when did
  the treasury receive a transfer"*

**2. Premium activation fee (6 XLM, one-time per creator)** — paid to
`growthip-creator-registry` on first activation, unlocking encrypted
private notes and analytics (see
[Premium](#premium-private-notes--analytics) above). Unlike the per-claim
fee, there's no privacy reason to delay this transfer (activating premium
already requires the creator's own signed transaction, which is no more
or less revealing than the fee payment itself) — it's still batched via
the same `withdraw_fees()` pattern, mainly for consistency and to avoid
an extra transfer on every single activation.

```rust
// growthip-pool
pub fn claim_to(...) -> bool { ... }          // 99% to recipient, 1% accrues
pub fn withdraw_fees(admin) -> i128;          // admin-gated batch withdrawal
pub fn accumulated_fees() -> i128;            // public read, for transparency

// growthip-creator-registry
pub fn register_encryption_pubkey(recipient, pubkey) { ... }  // 6 XLM first time, free after
pub fn withdraw_fees(admin) -> i128;          // same pattern
pub fn accumulated_fees() -> i128;
```

Both fee streams fund ongoing maintenance, infrastructure, and feature
development, and are disclosed transparently in the UI before the user
confirms any payment.
