extern crate std;

use soroban_sdk::{Bytes, Env, U256};
use std::vec::Vec as StdVec;

use crate::poseidon2::{get_zeroes, poseidon2_compress, poseidon2_hash2};

fn to_hex(env: &Env, x: &U256) -> std::string::String {
    let bytes: Bytes = x.to_be_bytes();
    let mut buf = StdVec::new();
    for b in bytes.iter() {
        buf.push(b);
    }
    buf.iter().map(|b| std::format!("{b:02x}")).collect()
}

// ─────────────────────────────────────────────────────────────────────────────
// All EXPECTED_* values below were computed INDEPENDENTLY from the vendored
// circom templates (circuits/lib/poseidon2/*.circom) with circom 2.2.2 witness
// calculators, then locked here. A passing test therefore proves the CAP-0075
// `poseidon2_permutation` host-function path and the in-circuit path produce
// bit-identical field elements. Regenerate/re-check the circom side with:
//   node circuits/scripts/poseidon2-parity.mjs
// ─────────────────────────────────────────────────────────────────────────────

// t=2 compression (Merkle inner nodes)
const EXPECTED_COMPRESS_7_11: &str =
    "0960972bcfa9d858be6a1cca2c850d2eb0e5df1ad309192beeb95f8be328945f";
const EXPECTED_COMPRESS_0_0: &str =
    "228981b886e5effb2c05a6be7ab4a05fde6bf702a2d039e46c87057dd729ef97";
const EXPECTED_COMPRESS_1_2: &str =
    "0e90c132311e864e0c8bca37976f28579a2dd9436bbc11326e21ec7c00cea5b3";

// t=3 hash: [a, b, domainSeparation]
const EXPECTED_HASH2_1_2_D0: &str =
    "2afac3bdc3663b71eefeecdf21b147d0ba7dd7a169a7757c05ed6bfb065bffd2";
const EXPECTED_HASH2_1_2_D1: &str =
    "2c50c6e642d5c7c8b35947a5f00e1391dc443b17b7bb6dc5d6bc19350b6dfcb4";
const EXPECTED_HASH2_7_11_D7: &str =
    "0350adb33ac11489fb4732e35f459326b1a2323919c0e592a1014a581d33112f";

// get_zeroes() endpoints. NOTE: this table (leaf zero = Poseidon2("XLM"), t=4)
// is vendored dead code inherited from Nethermind — the Cyphras vault, and the
// planned Growthip Pool V5 Merkle tree, use leaf zero = 0 instead (see
// vault_zero_chain test below). Kept and pinned so the vendored file cannot
// silently diverge.
const EXPECTED_ZEROES_0: &str =
    "25302288db99350344974183ce310d63b53abb9ef0f8575753eed36e0118f9ce";
const EXPECTED_ZEROES_32: &str =
    "134b50df02e2ccb98b59af2c2c55d7a41ff102681730c42ba364dbff1271cf62";

// Vault Merkle convention (the one Pool V5 MUST use): leaf zero = 0,
// zero-subtree chain z[i+1] = compress(z[i], z[i]). Empty-tree root at
// DEPTH = 20 — this exact value must also appear in the client-side
// merkle implementation and in circuit tests.
const EXPECTED_EMPTY_ROOT_DEPTH_20: &str =
    "119827e780a1850d7b7e34646edc1ce918211c26dda4e13bcd1611f6f81c3680";

#[test]
fn compress_reference_vectors() {
    let env = Env::default();
    let cases: [(u32, u32, &str); 3] = [
        (7, 11, EXPECTED_COMPRESS_7_11),
        (0, 0, EXPECTED_COMPRESS_0_0),
        (1, 2, EXPECTED_COMPRESS_1_2),
    ];
    for (l, r, expected) in cases {
        let out = poseidon2_compress(&env, U256::from_u32(&env, l), U256::from_u32(&env, r));
        assert_eq!(to_hex(&env, &out), expected, "compress({l},{r}) mismatch");
    }
}

#[test]
fn hash2_reference_vectors() {
    let env = Env::default();
    let cases: [(u32, u32, u32, &str); 3] = [
        (1, 2, 0, EXPECTED_HASH2_1_2_D0),
        (1, 2, 1, EXPECTED_HASH2_1_2_D1),
        (7, 11, 7, EXPECTED_HASH2_7_11_D7),
    ];
    for (a, b, dom, expected) in cases {
        let out = poseidon2_hash2(
            &env,
            U256::from_u32(&env, a),
            U256::from_u32(&env, b),
            Some(U256::from_u32(&env, dom)),
        );
        assert_eq!(to_hex(&env, &out), expected, "hash2({a},{b},dom={dom}) mismatch");
    }
}

#[test]
fn hash2_none_equals_domain_zero() {
    let env = Env::default();
    let with_none = poseidon2_hash2(&env, U256::from_u32(&env, 1), U256::from_u32(&env, 2), None);
    assert_eq!(to_hex(&env, &with_none), EXPECTED_HASH2_1_2_D0);
}

#[test]
fn zeroes_table_is_internally_consistent() {
    let env = Env::default();
    let zeroes = get_zeroes(&env);
    assert_eq!(zeroes.len(), 33);
    assert_eq!(to_hex(&env, &zeroes.get(0).unwrap()), EXPECTED_ZEROES_0);
    assert_eq!(to_hex(&env, &zeroes.get(32).unwrap()), EXPECTED_ZEROES_32);
    // Full chain: zeroes[i+1] == compress(zeroes[i], zeroes[i])
    for i in 0..32u32 {
        let z = zeroes.get(i).unwrap();
        let next = poseidon2_compress(&env, z.clone(), z);
        assert_eq!(next, zeroes.get(i + 1).unwrap(), "zeroes chain broken at level {i}");
    }
}

#[test]
fn vault_zero_chain_empty_root_depth_20() {
    let env = Env::default();
    // Mirrors merkle init: zeros[0] = 0, DEPTH-1 chain steps for the frontier,
    // then one more compress for the root (total 20 compress calls).
    let mut cur = U256::from_u32(&env, 0);
    for _ in 0..20 {
        cur = poseidon2_compress(&env, cur.clone(), cur);
    }
    assert_eq!(to_hex(&env, &cur), EXPECTED_EMPTY_ROOT_DEPTH_20);
}
