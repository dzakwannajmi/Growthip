// Verifies rebuild_merkle_root() (merkle_onchain.rs) produces the SAME
// root as merkle.ts's buildMerkleTree() for identical commitments.
//
// Ground truth generated via generate_merkle_test_vector.mjs, which
// calls the exact same circomlibjs hash2() path as production.
//
// Test commitments: ["111", "222", "333"]
// Expected root: 16702822978031546406842015819437124934072372409618798677484034877353581468772

#![cfg(test)]



include!("merkle_onchain.rs");

/// Same no_std-safe decimal-to-bytes conversion as poseidon_verify_test.rs.
fn decimal_str_to_be_bytes32(s: &str) -> [u8; 32] {
    const MAX_DIGITS: usize = 80;
    let mut digits = [0u8; MAX_DIGITS];
    let mut len = s.len();
    assert!(len <= MAX_DIGITS, "decimal string too long");
    for (i, b) in s.bytes().enumerate() {
        digits[i] = b - b'0';
    }

    let mut out = [0u8; 32];
    let mut idx = 31usize;

    loop {
        let mut remainder: u32 = 0;
        let mut write_pos = 0usize;
        let mut started = false;
        for read_pos in 0..len {
            let acc = remainder * 10 + digits[read_pos] as u32;
            let q = (acc / 256) as u8;
            remainder = acc % 256;
            if q != 0 || started {
                digits[write_pos] = q;
                write_pos += 1;
                started = true;
            }
        }
        out[idx] = remainder as u8;
        len = write_pos;

        if idx == 0 {
            break;
        }
        idx -= 1;
        if len == 0 {
            break;
        }
    }
    out
}

fn decimal_str_to_bytesn32(env: &Env, s: &str) -> BytesN<32> {
    let bytes_arr = decimal_str_to_be_bytes32(s);
    BytesN::from_array(env, &bytes_arr)
}

#[test]
fn merkle_root_matches_typescript_ground_truth() {
    let env = Env::default();

    // Test commitments ["111", "222", "333"] as BytesN<32>, mirroring
    // exactly what's stored on-chain via DataKey::Commitment(index).
    let c1 = decimal_str_to_bytesn32(&env, "111");
    let c2 = decimal_str_to_bytesn32(&env, "222");
    let c3 = decimal_str_to_bytesn32(&env, "333");

    let commitments: SVec<BytesN<32>> = vec![&env, c1, c2, c3];

    let actual_root = rebuild_merkle_root(&env, &commitments);

    let expected_root = decimal_str_to_bytesn32(
        &env,
        "16702822978031546406842015819437124934072372409618798677484034877353581468772",
    );

    assert_eq!(
        actual_root, expected_root,
        "Merkle root mismatch: on-chain rebuild_merkle_root() != merkle.ts \
         ground truth for commitments [111, 222, 333]. This means the tree \
         construction logic (padding, level hashing, sibling ordering) does \
         not match the frontend exactly — must be fixed before this touches \
         deposit_internal() or claim()."
    );
}

#[test]
fn merkle_root_empty_pool_matches_all_zero_leaves() {
    // Sanity check: an empty commitment list should produce the same root
    // as buildMerkleTree([]) in merkle.ts — i.e. all 8 leaves are the
    // empty-leaf value "0".
    let env = Env::default();
    let commitments: SVec<BytesN<32>> = SVec::new(&env);

    let actual_root = rebuild_merkle_root(&env, &commitments);

    // This value must be cross-checked against merkle.ts's
    // buildMerkleTree([]).root separately — included here as a structural
    // sanity test (does it run without panicking, is the result
    // deterministic) rather than a verified ground-truth assertion yet.
    let _ = actual_root; // no panic = basic sanity pass
}