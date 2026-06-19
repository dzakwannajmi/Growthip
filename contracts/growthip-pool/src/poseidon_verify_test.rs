// Standalone verification test: does soroban-sdk's poseidon_permutation
// host function, fed circomlib's RAW (non-opt) constants, produce the
// SAME output as circomlibjs's _opt (sparse-optimized) runtime path?
//
// This must be proven true BEFORE any of this touches claim() or
// deposit_internal(). If it fails, the mismatch is informative: it
// tells us whether the issue is in our constant extraction, in our
// understanding of the host function's expected semantics (e.g.
// initial-state handling, output extraction), or something else.
//
// Ground-truth values were computed via apps/web/src/lib/poseidon.ts's
// actual runtime path (circomlibjs buildPoseidon(), the _opt/sparse
// path) — see contracts/growthip-pool/poseidon_test_vectors.json.
//
// Test vector used here: hash2_inputs_1_2
//   inputs: ["1", "2"]  (t = inputs.len() + 1 = 3)
//   expected output (decimal):
//     7853200120776062878684798364095072458815029376092732009249414926327459813530

#![cfg(test)]

use soroban_sdk::Symbol;

// Import the generated constants module. Adjust path if your module
// layout differs (e.g. if this lives outside contracts/growthip-pool/src).
include!("poseidon_constants_generated.rs");

/// Converts a decimal-string field element (as produced by circomlibjs's
/// F.toString()) into a 32-byte big-endian array.
///
/// `#![no_std]` applies crate-wide (including #[cfg(test)] modules), so
/// this avoids any heap-allocated Vec entirely — uses a fixed-size
/// stack buffer instead. A BN254 field element decimal string is at
/// most 78 digits (the field prime has 77 digits + possible leading
/// guard), so a 80-byte buffer is comfortably sufficient.
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
        // Long division of `digits[0..len]` (big-endian decimal) by 256,
        // in place, producing the next output byte as the remainder.
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

#[test]
fn poseidon_t3_matches_circomlibjs_ground_truth() {
    let env = Env::default();

    // env.crypto_hazmat() is the correct accessor — CryptoHazmat::new()
    // is not directly callable even with the hazmat-crypto feature on,
    // because the constructor itself stays pub(crate); only the struct
    // visibility is conditionally widened. The env method is the
    // intended entry point.
    let hazmat = env.crypto_hazmat();

    // Sponge setup matching circomlibjs's poseidon_opt.js exactly:
    //   state = [initState(=0), ...inputs]
    // For hash2("1", "2"): initState = 0, inputs = [1, 2] -> state = [0, 1, 2]
    let zero = U256::from_u32(&env, 0);
    let one  = U256::from_u32(&env, 1);
    let two  = U256::from_u32(&env, 2);

    let input: SVec<U256> = vec![&env, zero, one, two];

    let result = hazmat.poseidon_permutation(
        &input,
        Symbol::new(&env, "BN254"),
        T3_T,
        T3_D,
        T3_ROUNDS_F,
        T3_ROUNDS_P,
        &t3_mds(&env),
        &t3_round_constants(&env),
    );

    // circomlibjs returns state[0] as the hash output for nOut=1.
    let actual_first_element = result.get(0).expect("empty permutation result");

    let expected_bytes = decimal_str_to_be_bytes32(
        "7853200120776062878684798364095072458815029376092732009249414926327459813530"
    );
    let expected = U256::from_be_bytes(&env, &Bytes::from_array(&env, &expected_bytes));

    assert_eq!(
        actual_first_element.to_be_bytes(),
        expected.to_be_bytes(),
        "Poseidon mismatch: host function output != circomlibjs ground truth. \
         This means either (a) our extracted constants are wrong, (b) our \
         sponge-construction assumptions (initial state, output extraction) \
         are wrong, or (c) the host function's internal algorithm produces \
         a result not directly comparable this way — needs investigation \
         before ANY of this touches the live contract."
    );
}
#[test]
fn poseidon_t2_matches_circomlibjs_ground_truth() {
    // hash1("123") via Poseidon, t=2 (initState=0, 1 input)
    // Ground truth: 9904028930859697121695025471312564917337032846528014134060777877259199866166
    let env = Env::default();
    let hazmat = env.crypto_hazmat();

    let zero = U256::from_u32(&env, 0);
    let input_val = U256::from_u32(&env, 123);
    let input: SVec<U256> = vec![&env, zero, input_val];

    let result = hazmat.poseidon_permutation(
        &input,
        Symbol::new(&env, "BN254"),
        T2_T,
        T2_D,
        T2_ROUNDS_F,
        T2_ROUNDS_P,
        &t2_mds(&env),
        &t2_round_constants(&env),
    );

    let actual_first_element = result.get(0).expect("empty permutation result");

    let expected_bytes = decimal_str_to_be_bytes32(
        "9904028930859697121695025471312564917337032846528014134060777877259199866166"
    );
    let expected = U256::from_be_bytes(&env, &Bytes::from_array(&env, &expected_bytes));

    assert_eq!(
        actual_first_element.to_be_bytes(),
        expected.to_be_bytes(),
        "Poseidon t=2 mismatch: host function output != circomlibjs ground truth for hash1(123)."
    );
}

#[test]
fn poseidon_t4_matches_circomlibjs_ground_truth() {
    // hash3(1, 2, 3) via Poseidon, t=4 (initState=0, 3 inputs)
    // Ground truth: 6542985608222806190361240322586112750744169038454362455181422643027100751666
    let env = Env::default();
    let hazmat = env.crypto_hazmat();

    let zero = U256::from_u32(&env, 0);
    let one  = U256::from_u32(&env, 1);
    let two  = U256::from_u32(&env, 2);
    let three = U256::from_u32(&env, 3);
    let input: SVec<U256> = vec![&env, zero, one, two, three];

    let result = hazmat.poseidon_permutation(
        &input,
        Symbol::new(&env, "BN254"),
        T4_T,
        T4_D,
        T4_ROUNDS_F,
        T4_ROUNDS_P,
        &t4_mds(&env),
        &t4_round_constants(&env),
    );

    let actual_first_element = result.get(0).expect("empty permutation result");

    let expected_bytes = decimal_str_to_be_bytes32(
        "6542985608222806190361240322586112750744169038454362455181422643027100751666"
    );
    let expected = U256::from_be_bytes(&env, &Bytes::from_array(&env, &expected_bytes));

    assert_eq!(
        actual_first_element.to_be_bytes(),
        expected.to_be_bytes(),
        "Poseidon t=4 mismatch: host function output != circomlibjs ground truth for hash3(1,2,3)."
    );
}
