# Attribution

`src/constants.rs` and `src/poseidon2.rs` are vendored verbatim from
[fxjrin/cyphras](https://github.com/fxjrin/cyphras) (Apache-2.0), which in turn
vendored them from
[NethermindEth/stellar-private-payments](https://github.com/NethermindEth/stellar-private-payments)
(Apache-2.0). They wrap the CAP-0075 `poseidon2_permutation` host function with
BN254 t=2/t=3 parameters.

The circom side (`circuits/lib/poseidon2/*.circom` and the parity mini-circuits
in `circuits/parity/`) is vendored from the same chain. Upstream file checksums
at vendoring time are recorded in `UPSTREAM_SHA256SUMS.txt` at the root of the
vendor drop.

Parity between the on-chain and in-circuit implementations is independently
verified in this repo:

- Rust / host-function side: `src/parity_test.rs` (`cargo test -p poseidon2`)
- circom side: `circuits/scripts/poseidon2-parity.mjs`

Both check the same locked reference vectors, which were computed from the
circom witness calculators (circom 2.2.2). Key vectors:

```
poseidon2_compress(7, 11) =
  0960972bcfa9d858be6a1cca2c850d2eb0e5df1ad309192beeb95f8be328945f
empty Merkle root, depth 20, leaf zero = 0 =
  119827e780a1850d7b7e34646edc1ce918211c26dda4e13bcd1611f6f81c3680
```

The Apache-2.0 license terms apply to the vendored files. Modifications made in
this repo: `src/parity_test.rs` was extended with additional locked vectors and
a vault zero-chain check; all other vendored files are unmodified.
