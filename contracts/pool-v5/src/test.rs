#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::Address as _, token::StellarAssetClient, token::TokenClient, Address, Bytes, BytesN,
    Env, U256,
};
use zk_types::ExtData;

use crate::{DataKey, Error, PoolV5, PoolV5Client};

// Per-pool domains (the cross-pool replay guard). XLM != USDC.
const DOMAIN_XLM: u32 = 1001;
const DOMAIN_USDC: u32 = 1002;

const MAX_DEPOSIT: i128 = 1_000_000_000i128;
const TVL_CAP: i128 = 1_000_000_000_000i128;

// Parity-locked empty root at depth 20 (leaf-zero = 0). Must match the circuit
// and circuits/scripts/poseidon2-parity.mjs.
const EMPTY_ROOT_HEX: &str = "119827e780a1850d7b7e34646edc1ce918211c26dda4e13bcd1611f6f81c3680";

// FIXED addresses for the deposit fixture's ExtData. These MUST be constant
// (not Address::generate(), which is random per call): the emitter and the E2E
// test have to build a byte-identical ExtData so keccak256(XDR(ext)) matches the
// hash embedded in the proof. Classic G... addresses, same as the Cyphras tests.
const FX_RECIPIENT: &str = "GCOHGXLEL4OEKN75E56Q5QJQB453QJMOSG35RJ6DR77655CPKBXKRGRO";
const FX_RELAYER: &str = "GDSMH6TSGB2AVFNLSGAQWV6DZQNKA7F6J6M7BQBPMANAP3EAZTONIDOM";

fn addr(env: &Env, s: &str) -> Address {
    Address::from_string(&soroban_sdk::String::from_str(env, s))
}

/// The one canonical deposit ExtData. Both the emitter and the E2E test call
/// this so the two ExtData values are guaranteed identical byte-for-byte.
fn deposit_fixture_ext(env: &Env) -> ExtData {
    ExtData {
        ext_amount: 100,
        fee: 0,
        recipient: addr(env, FX_RECIPIENT),
        relayer: addr(env, FX_RELAYER),
        encrypted_output0: Bytes::new(env),
        encrypted_output1: Bytes::new(env),
    }
}

fn hexbytes<const N: usize>(s: &str) -> [u8; N] {
    let b = s.as_bytes();
    let mut out = [0u8; N];
    let h = |c: u8| -> u8 {
        if c >= b'a' {
            c - b'a' + 10
        } else {
            c - b'0'
        }
    };
    for i in 0..N {
        out[i] = (h(b[2 * i]) << 4) | h(b[2 * i + 1]);
    }
    out
}

fn u256_hex(env: &Env, s: &str) -> U256 {
    U256::from_be_bytes(env, &Bytes::from_array(env, &hexbytes::<32>(s)))
}

fn hex_string(env: &Env, x: &U256) -> std::string::String {
    let b: Bytes = x.to_be_bytes();
    let mut out = std::vec::Vec::new();
    for byte in b.iter() {
        out.push(byte);
    }
    // left-pad to 32 bytes
    while out.len() < 32 {
        out.insert(0, 0u8);
    }
    out.iter().map(|b| std::format!("{b:02x}")).collect()
}

fn setup(env: &Env, domain_u32: u32) -> (Address, PoolV5Client, Address) {
    let id = env.register(PoolV5, ());
    let client = PoolV5Client::new(env, &id);
    let admin = Address::generate(env);

    let token_admin = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(token_admin);
    let token = sac.address();

    let domain = U256::from_u32(env, domain_u32);
    client.initialize(&admin, &token, &domain, &MAX_DEPOSIT, &TVL_CAP);
    (id, client, token)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanity / unit-level (no proof needed)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn empty_root_matches_parity_lock() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, _t) = setup(&env, DOMAIN_XLM);
    assert_eq!(client.current_root(), u256_hex(&env, EMPTY_ROOT_HEX));
    // Zero is never a known root.
    assert!(!client.is_known_root(&U256::from_u32(&env, 0)));
    assert!(client.is_known_root(&u256_hex(&env, EMPTY_ROOT_HEX)));
}

#[test]
fn initialize_twice_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(PoolV5, ());
    let client = PoolV5Client::new(&env, &id);
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let token = sac.address();
    let domain = U256::from_u32(&env, DOMAIN_XLM);
    client.initialize(&admin, &token, &domain, &MAX_DEPOSIT, &TVL_CAP);
    let res = client.try_initialize(&admin, &token, &domain, &MAX_DEPOSIT, &TVL_CAP);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn initialize_rejects_zero_domain() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(PoolV5, ());
    let client = PoolV5Client::new(&env, &id);
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let token = sac.address();
    let res = client.try_initialize(
        &admin,
        &token,
        &U256::from_u32(&env, 0),
        &MAX_DEPOSIT,
        &TVL_CAP,
    );
    assert_eq!(res, Err(Ok(Error::BadDomain)));
}

#[test]
fn initialize_rejects_bad_config() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(PoolV5, ());
    let client = PoolV5Client::new(&env, &id);
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let token = sac.address();
    let domain = U256::from_u32(&env, DOMAIN_XLM);
    // tvl_cap < max_deposit
    let res = client.try_initialize(&admin, &token, &domain, &MAX_DEPOSIT, &(MAX_DEPOSIT - 1));
    assert_eq!(res, Err(Ok(Error::BadConfig)));
}

#[test]
fn register_enc_key_is_versioned() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, _t) = setup(&env, DOMAIN_XLM);
    let owner = Address::generate(&env);
    let k1 = BytesN::from_array(&env, &[7u8; 32]);
    client.register_enc_key(&owner, &1, &k1);
    assert_eq!(client.get_enc_key(&owner).unwrap().value, k1);
    // Stale version rejected.
    let res = client.try_register_enc_key(&owner, &1, &BytesN::from_array(&env, &[9u8; 32]));
    assert!(res.is_err());
    // Newer supersedes.
    let k2 = BytesN::from_array(&env, &[9u8; 32]);
    client.register_enc_key(&owner, &2, &k2);
    assert_eq!(client.get_enc_key(&owner).unwrap().value, k2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture emitter — run: cargo test -p pool-v5 emit_deposit_fixture -- --nocapture --ignored
// Prints the canonical public signals a deposit proof must bind. Feed these into
// circuits/scripts/gen-contract-fixture.mjs to produce the real Groth16 proof,
// then paste the hex into circuits/build/fixtures/ (see HARI3-INSTRUKSI.md).
// ─────────────────────────────────────────────────────────────────────────────

#[test]
#[ignore = "fixture emitter; run with --nocapture --ignored"]
fn emit_deposit_fixture() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, _token) = setup(&env, DOMAIN_XLM);

    let ext = deposit_fixture_ext(&env);
    // Recompute exactly as transact() will.
    let edh = PoolV5::hash_ext_data(&env, &ext);
    let pa = PoolV5::calc_public_amount(&env, 100);

    std::println!("FIXTURE_ROOT={}", hex_string(&env, &client.current_root()));
    std::println!("FIXTURE_EXTHASH={}", hex_string(&env, &edh));
    std::println!("FIXTURE_PUBAMOUNT={}", hex_string(&env, &pa));
    std::println!("FIXTURE_DOMAIN={}", hex_string(&env, &U256::from_u32(&env, DOMAIN_XLM)));
}

// ─────────────────────────────────────────────────────────────────────────────
// E2E: real Groth16 proof through transact(). Ignored until the fixture hex is
// generated (needs the trusted-setup zkey, only present on the dev machine).
// The generator writes these files; see HARI3-INSTRUKSI.md.
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn e2e_deposit_moves_custody_and_spends_nullifiers() {
    use zk_types::TxProof;

    let env = Env::default();
    env.mock_all_auths();

    let id = env.register(PoolV5, ());
    let client = PoolV5Client::new(&env, &id);
    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin);
    let token = sac.address();
    let mint = StellarAssetClient::new(&env, &token);
    let coin = TokenClient::new(&env, &token);
    let domain = U256::from_u32(&env, DOMAIN_XLM);
    client.initialize(&admin, &token, &domain, &MAX_DEPOSIT, &TVL_CAP);

    // Fixture hex produced by the generator from emit_deposit_fixture values.
    let a_hex = include_str!("../../../circuits/build/fixtures/deposit_a.hex");
    let b_hex = include_str!("../../../circuits/build/fixtures/deposit_b.hex");
    let c_hex = include_str!("../../../circuits/build/fixtures/deposit_c.hex");
    let root_hex = include_str!("../../../circuits/build/fixtures/deposit_root.hex");
    let pa_hex = include_str!("../../../circuits/build/fixtures/deposit_pubamount.hex");
    let eh_hex = include_str!("../../../circuits/build/fixtures/deposit_exthash.hex");
    let n0_hex = include_str!("../../../circuits/build/fixtures/deposit_null0.hex");
    let n1_hex = include_str!("../../../circuits/build/fixtures/deposit_null1.hex");
    let c0_hex = include_str!("../../../circuits/build/fixtures/deposit_comm0.hex");
    let c1_hex = include_str!("../../../circuits/build/fixtures/deposit_comm1.hex");

    use soroban_sdk::crypto::bn254::{Bn254G1Affine, Bn254G2Affine};
    let mut nulls = soroban_sdk::Vec::new(&env);
    nulls.push_back(u256_hex(&env, n0_hex.trim()));
    nulls.push_back(u256_hex(&env, n1_hex.trim()));
    let mut comms = soroban_sdk::Vec::new(&env);
    comms.push_back(u256_hex(&env, c0_hex.trim()));
    comms.push_back(u256_hex(&env, c1_hex.trim()));

    let proof = TxProof {
        a: Bn254G1Affine::from_bytes(BytesN::from_array(&env, &hexbytes::<64>(a_hex.trim()))),
        b: Bn254G2Affine::from_bytes(BytesN::from_array(&env, &hexbytes::<128>(b_hex.trim()))),
        c: Bn254G1Affine::from_bytes(BytesN::from_array(&env, &hexbytes::<64>(c_hex.trim()))),
        root: u256_hex(&env, root_hex.trim()),
        public_amount: u256_hex(&env, pa_hex.trim()),
        ext_data_hash: u256_hex(&env, eh_hex.trim()),
        input_nullifiers: nulls,
        output_commitments: comms,
    };

    // Root the proof binds must equal the pool's empty root.
    assert_eq!(client.current_root(), proof.root);

    // THE canonical deposit ExtData — byte-identical to what the emitter hashed
    // (both call deposit_fixture_ext with the SAME fixed addresses). Using
    // Address::generate() here was the Day-3 WrongExtHash bug: random addresses
    // per call made keccak256(XDR(ext)) differ from the proof's embedded hash.
    let sender = Address::generate(&env);
    mint.mint(&sender, &100i128);
    let ext = deposit_fixture_ext(&env);

    // Fail LOUD and EARLY if the fixture ever drifts from this ExtData: assert
    // the on-chain recompute equals the proof's embedded hash BEFORE transact,
    // so a mismatch shows here as a clear assert, not as an opaque WrongExtHash.
    assert_eq!(
        PoolV5::hash_ext_data(&env, &ext),
        proof.ext_data_hash,
        "ExtData recompute != proof's embedded extDataHash — regenerate the \
         fixture with gen-contract-fixture.mjs using the emitted FIXTURE_EXTHASH"
    );

    client.transact(&proof, &ext, &sender);

    assert_eq!(coin.balance(&id), 100);
    assert_eq!(coin.balance(&sender), 0);
    assert!(client.is_nullifier_spent(&u256_hex(&env, n0_hex.trim())));
    assert!(client.is_nullifier_spent(&u256_hex(&env, n1_hex.trim())));

    // Double-spend of the same proof now fails on UnknownRoot (root advanced)
    // or SpentNullifier — either way, not Ok.
    let res = client.try_transact(&proof, &ext, &sender);
    assert!(res.is_err());
}

// ─────────────────────────────────────────────────────────────────────────────
// Attack cases that need NO proof: they must be rejected BEFORE verification,
// so a syntactically-shaped-but-fake proof suffices. We build a zero proof and
// assert the specific pre-verification error fires.
// ─────────────────────────────────────────────────────────────────────────────

fn fake_proof(env: &Env, root: U256, pa: U256, eh: U256, n: [U256; 2], c: [U256; 2]) -> zk_types::TxProof {
    use soroban_sdk::crypto::bn254::{Bn254G1Affine, Bn254G2Affine};
    let g1 = Bn254G1Affine::from_bytes(BytesN::from_array(env, &[0u8; 64]));
    let g2 = Bn254G2Affine::from_bytes(BytesN::from_array(env, &[0u8; 128]));
    let mut nulls = soroban_sdk::Vec::new(env);
    nulls.push_back(n[0].clone());
    nulls.push_back(n[1].clone());
    let mut comms = soroban_sdk::Vec::new(env);
    comms.push_back(c[0].clone());
    comms.push_back(c[1].clone());
    zk_types::TxProof {
        a: g1.clone(),
        b: g2,
        c: g1,
        root,
        public_amount: pa,
        ext_data_hash: eh,
        input_nullifiers: nulls,
        output_commitments: comms,
    }
}

fn deposit_ext(env: &Env) -> ExtData {
    ExtData {
        ext_amount: 100,
        fee: 0,
        recipient: Address::generate(env),
        relayer: Address::generate(env),
        encrypted_output0: Bytes::new(env),
        encrypted_output1: Bytes::new(env),
    }
}

#[test]
fn attack_unknown_root_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, token) = setup(&env, DOMAIN_XLM);
    StellarAssetClient::new(&env, &token).mint(&Address::generate(&env), &100i128);

    let ext = deposit_ext(&env);
    let eh = PoolV5::hash_ext_data(&env, &ext);
    let pa = PoolV5::calc_public_amount(&env, 100);
    // A root the pool never produced.
    let bad_root = u256_hex(&env, "0000000000000000000000000000000000000000000000000000000000000abc");
    let proof = fake_proof(
        &env,
        bad_root,
        pa,
        eh,
        [U256::from_u32(&env, 1), U256::from_u32(&env, 2)],
        [U256::from_u32(&env, 3), U256::from_u32(&env, 4)],
    );
    let sender = Address::generate(&env);
    let res = client.try_transact(&proof, &ext, &sender);
    assert_eq!(res, Err(Ok(Error::UnknownRoot)));
}

#[test]
fn attack_non_canonical_input_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, _t) = setup(&env, DOMAIN_XLM);
    let ext = deposit_ext(&env);
    let eh = PoolV5::hash_ext_data(&env, &ext);
    let pa = PoolV5::calc_public_amount(&env, 100);
    // A nullifier >= p (field modulus). p itself is non-canonical.
    let p_hex = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";
    let non_canon = u256_hex(&env, p_hex);
    let proof = fake_proof(
        &env,
        client.current_root(),
        pa,
        eh,
        [non_canon, U256::from_u32(&env, 2)],
        [U256::from_u32(&env, 3), U256::from_u32(&env, 4)],
    );
    let sender = Address::generate(&env);
    let res = client.try_transact(&proof, &ext, &sender);
    assert_eq!(res, Err(Ok(Error::NonCanonicalInput)));
}

#[test]
fn attack_wrong_ext_hash_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, _t) = setup(&env, DOMAIN_XLM);
    let ext = deposit_ext(&env);
    let pa = PoolV5::calc_public_amount(&env, 100);
    // extDataHash that does NOT match keccak(XDR(ext)).
    let wrong_eh = U256::from_u32(&env, 12345);
    let proof = fake_proof(
        &env,
        client.current_root(),
        pa,
        wrong_eh,
        [U256::from_u32(&env, 1), U256::from_u32(&env, 2)],
        [U256::from_u32(&env, 3), U256::from_u32(&env, 4)],
    );
    let sender = Address::generate(&env);
    let res = client.try_transact(&proof, &ext, &sender);
    assert_eq!(res, Err(Ok(Error::WrongExtHash)));
}

#[test]
fn attack_wrong_public_amount_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, _t) = setup(&env, DOMAIN_XLM);
    let ext = deposit_ext(&env);
    let eh = PoolV5::hash_ext_data(&env, &ext);
    // publicAmount inconsistent with signed = 100.
    let wrong_pa = PoolV5::calc_public_amount(&env, 999);
    let proof = fake_proof(
        &env,
        client.current_root(),
        wrong_pa,
        eh,
        [U256::from_u32(&env, 1), U256::from_u32(&env, 2)],
        [U256::from_u32(&env, 3), U256::from_u32(&env, 4)],
    );
    let sender = Address::generate(&env);
    let res = client.try_transact(&proof, &ext, &sender);
    assert_eq!(res, Err(Ok(Error::WrongPublicAmount)));
}

#[test]
fn attack_deposit_exceeds_max_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, _t) = setup(&env, DOMAIN_XLM);
    let mut ext = deposit_ext(&env);
    ext.ext_amount = MAX_DEPOSIT + 1;
    let eh = PoolV5::hash_ext_data(&env, &ext);
    let pa = PoolV5::calc_public_amount(&env, MAX_DEPOSIT + 1);
    let proof = fake_proof(
        &env,
        client.current_root(),
        pa,
        eh,
        [U256::from_u32(&env, 1), U256::from_u32(&env, 2)],
        [U256::from_u32(&env, 3), U256::from_u32(&env, 4)],
    );
    let sender = Address::generate(&env);
    let res = client.try_transact(&proof, &ext, &sender);
    assert_eq!(res, Err(Ok(Error::DepositTooLarge)));
}

#[test]
fn attack_malformed_nullifier_count_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, _t) = setup(&env, DOMAIN_XLM);
    let ext = deposit_ext(&env);
    let eh = PoolV5::hash_ext_data(&env, &ext);
    let pa = PoolV5::calc_public_amount(&env, 100);
    // Only ONE nullifier instead of two.
    use soroban_sdk::crypto::bn254::{Bn254G1Affine, Bn254G2Affine};
    let g1 = Bn254G1Affine::from_bytes(BytesN::from_array(&env, &[0u8; 64]));
    let g2 = Bn254G2Affine::from_bytes(BytesN::from_array(&env, &[0u8; 128]));
    let mut nulls = soroban_sdk::Vec::new(&env);
    nulls.push_back(U256::from_u32(&env, 1));
    let mut comms = soroban_sdk::Vec::new(&env);
    comms.push_back(U256::from_u32(&env, 3));
    comms.push_back(U256::from_u32(&env, 4));
    let proof = zk_types::TxProof {
        a: g1.clone(),
        b: g2,
        c: g1,
        root: client.current_root(),
        public_amount: pa,
        ext_data_hash: eh,
        input_nullifiers: nulls,
        output_commitments: comms,
    };
    let sender = Address::generate(&env);
    let res = client.try_transact(&proof, &ext, &sender);
    assert_eq!(res, Err(Ok(Error::MalformedProof)));
}

#[test]
fn attack_paused_rejects_transact() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, _t) = setup(&env, DOMAIN_XLM);
    client.set_paused(&true);
    let ext = deposit_ext(&env);
    let eh = PoolV5::hash_ext_data(&env, &ext);
    let pa = PoolV5::calc_public_amount(&env, 100);
    let proof = fake_proof(
        &env,
        client.current_root(),
        pa,
        eh,
        [U256::from_u32(&env, 1), U256::from_u32(&env, 2)],
        [U256::from_u32(&env, 3), U256::from_u32(&env, 4)],
    );
    let sender = Address::generate(&env);
    let res = client.try_transact(&proof, &ext, &sender);
    assert_eq!(res, Err(Ok(Error::Paused)));
}

// Cross-pool replay: a proof bound to DOMAIN_XLM must fail on a DOMAIN_USDC
// pool. Pre-verification checks all pass (same root/exthash/pubamount), so this
// reaches the verifier and fails there. With the zero placeholder VK this still
// returns InvalidProof; with the real fixture it fails the pairing check on the
// mismatched domain public input. Either way: not Ok, no state change.
#[test]
#[ignore = "meaningful only with the real embedded VK + fixture; see HARI3-INSTRUKSI.md"]
fn attack_cross_pool_domain_replay_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    // A proof generated for the XLM pool...
    let (_id, xlm_client, _t) = setup(&env, DOMAIN_XLM);
    let _ = DOMAIN_USDC; // used conceptually; real assertion needs fixture
    let _ = xlm_client;
}
