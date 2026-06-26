// Verifies insert_leaf() (merkle_onchain.rs) produces the SAME
// root as the incremental Merkle tree in merkle.ts (depth-20).
//
// Ground truth generated via scripts/gen_v4_test_vectors.js,
// which calls the exact same circomlibjs hash2() path as production.
//
// Test commitments: ["111", "222", "333"] inserted incrementally
// Expected roots after each insert:
//   [0]: 700078111190831670849385823071813789491043617335647358169588757137046951096
//   [1]: 2054110252543727001711616886670528355999329639484983779890887767796806088448
//   [2]: 2632647455406297918243272014766064539557014194386712101819113563278735517668
// Empty root (depth-20):
//   15019797232609675441998260052101280400536945603062888308240081994073687793470
#![cfg(test)]
include!("merkle_onchain.rs");

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
        if idx == 0 { break; }
        idx -= 1;
        if len == 0 { break; }
    }
    out
}

fn decimal_str_to_bytesn32(env: &Env, s: &str) -> BytesN<32> {
    BytesN::from_array(env, &decimal_str_to_be_bytes32(s))
}

#[test]
fn empty_root_matches_depth20_ground_truth() {
    let env = Env::default();
    env.budget().reset_unlimited();
    env.budget().reset_unlimited();
    let actual = empty_root(&env);
    let expected = decimal_str_to_bytesn32(
        &env,
        "15019797232609675441998260052101280400536945603062888308240081994073687793470",
    );
    assert_eq!(actual, expected, "empty_root() mismatch for depth-20 tree");
}

#[test]
fn incremental_inserts_match_ground_truth() {
    let env = Env::default();
    env.budget().reset_unlimited();
    env.budget().reset_unlimited();
    let commitments = ["111", "222", "333"];
    let expected_roots = [
        "700078111190831670849385823071813789491043617335647358169588757137046951096",
        "2054110252543727001711616886670528355999329639484983779890887767796806088448",
        "2632647455406297918243272014766064539557014194386712101819113563278735517668",
    ];

    let mut frontier = empty_frontier(&env);

    for (i, (commitment_str, expected_root_str)) in
        commitments.iter().zip(expected_roots.iter()).enumerate()
    {
        let leaf = decimal_str_to_bytesn32(&env, commitment_str);
        let (root, new_frontier) = insert_leaf(&env, &leaf, i as u32, &frontier);
        frontier = new_frontier;

        let expected = decimal_str_to_bytesn32(&env, expected_root_str);
        assert_eq!(
            root, expected,
            "Root mismatch after inserting commitment[{}]={} — \
             incremental insert_leaf() != merkle.ts ground truth",
            i, commitment_str
        );
    }
}
