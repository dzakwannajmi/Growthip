# Creator Links, Sharing & Premium

> Part of the Growthip documentation set. See the [root README](../README.md) for the project overview.

---

## Creator Links & Sharing

Every connected wallet gets a personal, shareable tip page at
`growthip.vercel.app/tip/<id>`, where `<id>` is the creator's Stellar
address transformed with a reversible base62 encoding
(`apps/web/src/lib/addressId.ts`).

**This is cosmetic obfuscation, not cryptographic privacy.** The transform
is publicly computable in both directions — anyone opening the link can
decode it back to the real address, because the supporter's browser needs
to know where to send the tip. Its only purpose is avoiding a raw
56-character Stellar address sitting in a casually-shared URL. The
creator's real address is still fully visible on-chain the instant they
call `register_recipient()` or `claim_to()` — this does not and cannot
hide that.

The Settings page provides: a profile (avatar, display name, bio — all
local-only, never published on-chain), an address copy button, and a
tip-link card with copy and QR code.

The public tip page (`apps/web/src/app/tip/[id]/page.tsx`) lets a
supporter, without ever creating an account: connect Freighter or xBull, pick a
token and preset amount, optionally attach a public on-chain message (max
50 characters), deposit, and receive/share their resulting encrypted
private note — including as a QR code the creator can scan directly. If
the creator hasn't activated premium, the page shows a banner instead of
a deposit form, since private notes are mandatory.

---

## Premium: Private Notes & Analytics

A one-time, on-chain payment (6 XLM, paid to `growthip-creator-registry`)
unlocks two creator-facing features:

* **Encrypted private notes** — described above and in
  [SECURITY.md](SECURITY.md)
* **Analytics dashboard** — pool statistics and claimed-tip history

Activation also publishes the creator's X25519 encryption public key
on-chain, which is what makes the first feature possible at all — a
supporter's browser needs somewhere public to read that key from before
it can encrypt a note.

This is deliberately a **separate contract** from `growthip-pool`, not a
field added to it: `growthip-pool` is deployed once *per token*, but
premium status is a property of the creator's identity, not of "the
creator within one specific pool" — putting it in the pool would mean
paying the activation fee once per token. See
[contracts/README.md](contracts/README.md#growthip-creator-registry--structure)
for the contract-level reasoning.

Key rotation (e.g. restoring access on a new device via recovery phrase,
and publishing the resulting new public key) does not re-charge the fee
— only the very first activation does.
