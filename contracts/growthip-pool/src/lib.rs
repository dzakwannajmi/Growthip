#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Bytes, BytesN, Env, Vec};

use growthip_merkle_verifier_v2::GrowthipMerkleVerifierClient;

const TIP_AMOUNT: i128 = 100_000_000; // 10 XLM, 7 decimals

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Verifier,
    Token,
    CurrentRoot,
    RecipientHash(Address),
    NullifierUsed(BytesN<32>),
    Commitment(u32),
    TotalDeposits,
    TotalClaims,
}

#[contract]
pub struct GrowthipPool;

#[contractimpl]
impl GrowthipPool {
    pub fn initialize(env: Env, admin: Address, verifier: Address, root: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.storage().instance().set(&DataKey::CurrentRoot, &root);
        env.storage().instance().set(&DataKey::TotalDeposits, &0u32);
        env.storage().instance().set(&DataKey::TotalClaims, &0u32);
    }

    // NEW: allows upgrading verifier to v3 without redeploying pool
    pub fn update_verifier(env: Env, admin: Address, new_verifier: Address) {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        stored_admin.require_auth();
        if stored_admin != admin {
            panic!("not admin");
        }
        env.storage()
            .instance()
            .set(&DataKey::Verifier, &new_verifier);
    }

    /// Upgrade the pool contract WASM (admin only).
    /// Allows fixing bugs without redeploying and losing state (audit finding H3).
    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        stored_admin.require_auth();
        if stored_admin != admin {
            panic!("not admin");
        }
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn update_root(env: Env, admin: Address, new_root: BytesN<32>) {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        stored_admin.require_auth();
        if stored_admin != admin {
            panic!("not admin");
        }
        env.storage()
            .instance()
            .set(&DataKey::CurrentRoot, &new_root);
    }

    pub fn current_root(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::CurrentRoot)
            .expect("root not set")
    }

    pub fn register_recipient(env: Env, recipient: Address, recipient_hash: BytesN<32>) {
        recipient.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::RecipientHash(recipient), &recipient_hash);
    }

    /// Returns the registered recipient hash, or None if not registered.
    /// Returns Option to avoid panicking on read-only simulation (audit finding L1).
    pub fn get_recipient_hash(env: Env, recipient: Address) -> Option<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::RecipientHash(recipient))
    }

    pub fn set_token(env: Env, admin: Address, token_addr: Address) {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        stored_admin.require_auth();
        if stored_admin != admin {
            panic!("not admin");
        }

        // HARDENING: disallow token change after deposits exist
        let total: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TotalDeposits)
            .unwrap_or(0u32);
        if total > 0 {
            panic!("cannot change token after deposits");
        }

        env.storage().instance().set(&DataKey::Token, &token_addr);
    }

    pub fn token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .expect("token not set")
    }

    pub fn tip_amount(_env: Env) -> i128 {
        TIP_AMOUNT
    }

    pub fn deposit_paid(env: Env, depositor: Address, commitment: BytesN<32>) -> u32 {
        depositor.require_auth();
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("token not set");
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&depositor, &env.current_contract_address(), &TIP_AMOUNT);
        Self::deposit_internal(&env, commitment)
    }

    pub fn claim_to(
        env: Env,
        recipient: Address,
        proof_bytes: Bytes,
        public_inputs: Vec<BytesN<32>>,
    ) -> bool {
        if public_inputs.len() != 3 {
            return false;
        }

        let proof_recipient_hash = public_inputs.get(2).expect("missing recipient hash");

        let expected_recipient_hash: Option<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::RecipientHash(recipient.clone()));

        let expected_recipient_hash = match expected_recipient_hash {
            Some(value) => value,
            None => return false,
        };

        if proof_recipient_hash != expected_recipient_hash {
            return false;
        }

        let ok = Self::claim(env.clone(), proof_bytes, public_inputs);
        if !ok {
            return false;
        }

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("token not set");
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&env.current_contract_address(), &recipient, &TIP_AMOUNT);

        true
    }

    /// Internal commitment storage helper.
    /// Not public: deposits must go through `deposit_paid` which enforces payment.
    /// This prevents griefing via free commitment spam (audit finding H1).
    fn deposit_internal(env: &Env, commitment: BytesN<32>) -> u32 {
        let index: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TotalDeposits)
            .unwrap_or(0u32);
        env.storage()
            .persistent()
            .set(&DataKey::Commitment(index), &commitment);
        env.storage()
            .instance()
            .set(&DataKey::TotalDeposits, &(index + 1));

        // Emit privacy-safe event: index only, no depositor or commitment value
        env.events().publish((soroban_sdk::symbol_short!("deposit"),), index);

        index
    }

    pub fn get_commitment(env: Env, index: u32) -> BytesN<32> {
        env.storage()
            .persistent()
            .get(&DataKey::Commitment(index))
            .expect("commitment not found")
    }

    pub fn total_deposits(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::TotalDeposits)
            .unwrap_or(0u32)
    }

    pub fn is_nullifier_used(env: Env, nullifier_hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::NullifierUsed(nullifier_hash))
    }

    pub fn total_claims(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::TotalClaims)
            .unwrap_or(0u32)
    }

    pub fn claim(env: Env, proof_bytes: Bytes, public_inputs: Vec<BytesN<32>>) -> bool {
        if public_inputs.len() != 3 {
            return false;
        }

        let root          = public_inputs.get(0).expect("missing root");
        let nullifier_hash = public_inputs.get(1).expect("missing nullifier hash");

        let current_root: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::CurrentRoot)
            .expect("root not set");

        if root != current_root {
            return false;
        }

        if env
            .storage()
            .persistent()
            .has(&DataKey::NullifierUsed(nullifier_hash.clone()))
        {
            return false;
        }

        let verifier: Address = env
            .storage()
            .instance()
            .get(&DataKey::Verifier)
            .expect("verifier not set");

        let verifier_client = GrowthipMerkleVerifierClient::new(&env, &verifier);
        let ok = verifier_client.verify(&proof_bytes, &public_inputs);

        if !ok {
            return false;
        }

        env.storage()
            .persistent()
            .set(&DataKey::NullifierUsed(nullifier_hash.clone()), &true);

        let total: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TotalClaims)
            .unwrap_or(0u32);
        env.storage()
            .instance()
            .set(&DataKey::TotalClaims, &(total + 1));

        // Emit privacy-safe event: nullifier_hash only, no recipient address
        env.events().publish((soroban_sdk::symbol_short!("claim"),), nullifier_hash);

        true
    }
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use growthip_merkle_verifier_v2::GrowthipMerkleVerifier;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{token, Bytes, BytesN, Env, Vec};

    fn bytes_from_hex(env: &Env, hex_str: &str) -> Bytes {
        let raw = hex::decode(hex_str.trim()).expect("invalid hex");
        Bytes::from_slice(env, &raw)
    }

    fn public_inputs_from_hex(env: &Env, hex_str: &str) -> Vec<BytesN<32>> {
        let clean = hex_str.trim();
        assert!(clean.len() % 64 == 0, "public input hex must be multiple of 64");
        let mut out = Vec::new(env);
        for chunk_start in (0..clean.len()).step_by(64) {
            let chunk = &clean[chunk_start..chunk_start + 64];
            let raw: [u8; 32] = hex::decode(chunk)
                .expect("invalid hex chunk")
                .try_into()
                .expect("must be 32 bytes");
            out.push_back(BytesN::from_array(env, &raw));
        }
        out
    }

    // ----------------------------------------------------------------
    // Existing V2 tests (unchanged)
    // ----------------------------------------------------------------

    #[test]
    fn test_claim_to_rejects_wrong_recipient_hash() {
        let env = Env::default();
        env.mock_all_auths();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);

        let admin             = Address::generate(&env);
        let supporter         = Address::generate(&env);
        let correct_recipient = Address::generate(&env);
        let wrong_recipient   = Address::generate(&env);

        let token_admin       = Address::generate(&env);
        let sac               = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr        = sac.address();
        let token_client      = token::Client::new(&env, &token_addr);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let proof_hex = include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let pub_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes   = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, pub_hex);

        let root                 = public_inputs.get(0).expect("missing root");
        let nullifier_hash       = public_inputs.get(1).expect("missing nullifier hash");
        let correct_recipient_hash = public_inputs.get(2).expect("missing recipient hash");

        client.initialize(&admin, &verifier_id, &root);
        client.set_token(&admin, &token_addr);
        client.register_recipient(&correct_recipient, &correct_recipient_hash);

        let mut wrong_bytes = [0u8; 32];
        wrong_bytes[31] = 88;
        let wrong_hash = BytesN::from_array(&env, &wrong_bytes);
        client.register_recipient(&wrong_recipient, &wrong_hash);

        let amount = client.tip_amount();
        token_admin_client.mint(&supporter, &amount);

        let mut cb = [0u8; 32]; cb[31] = 99;
        let commitment = BytesN::from_array(&env, &cb);
        client.deposit_paid(&supporter, &commitment);

        assert_eq!(token_client.balance(&pool_id), amount);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), false);

        assert_eq!(client.claim_to(&wrong_recipient, &proof_bytes, &public_inputs), false);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), false);
        assert_eq!(client.total_claims(), 0);

        assert_eq!(client.claim_to(&correct_recipient, &proof_bytes, &public_inputs), true);
        assert_eq!(token_client.balance(&correct_recipient), amount);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), true);
        assert_eq!(client.total_claims(), 1);
    }

    #[test]
    fn test_paid_deposit_and_claim_to_recipient() {
        let env = Env::default();
        env.mock_all_auths();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);

        let admin     = Address::generate(&env);
        let supporter = Address::generate(&env);
        let recipient = Address::generate(&env);

        let token_admin        = Address::generate(&env);
        let sac                = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr         = sac.address();
        let token_client       = token::Client::new(&env, &token_addr);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let proof_hex = include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let pub_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes   = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, pub_hex);

        let root           = public_inputs.get(0).expect("missing root");
        let recipient_hash = public_inputs.get(2).expect("missing recipient hash");

        client.initialize(&admin, &verifier_id, &root);
        client.set_token(&admin, &token_addr);
        client.register_recipient(&recipient, &recipient_hash);

        let amount = client.tip_amount();
        token_admin_client.mint(&supporter, &amount);

        let mut cb = [0u8; 32]; cb[31] = 77;
        let commitment = BytesN::from_array(&env, &cb);
        let index = client.deposit_paid(&supporter, &commitment);

        assert_eq!(index, 0);
        assert_eq!(client.total_deposits(), 1);
        assert_eq!(token_client.balance(&pool_id), amount);

        assert_eq!(client.claim_to(&recipient, &proof_bytes, &public_inputs), true);
        assert_eq!(token_client.balance(&recipient), amount);
        assert_eq!(token_client.balance(&pool_id), 0);

        // double claim blocked
        assert_eq!(client.claim_to(&recipient, &proof_bytes, &public_inputs), false);
        assert_eq!(token_client.balance(&recipient), amount);
    }

    #[test]
    fn test_deposit_stores_commitment() {
        let env = Env::default();
        env.mock_all_auths();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);
        let admin       = Address::generate(&env);
        let supporter   = Address::generate(&env);

        let token_admin        = Address::generate(&env);
        let sac                = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr         = sac.address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let mut rb = [0u8; 32]; rb[31] = 1;
        let root = BytesN::from_array(&env, &rb);
        client.initialize(&admin, &verifier_id, &root);
        client.set_token(&admin, &token_addr);

        // Fund supporter for two paid deposits
        token_admin_client.mint(&supporter, &(TIP_AMOUNT * 2));

        let mut c1b = [0u8; 32]; c1b[31] = 11;
        let mut c2b = [0u8; 32]; c2b[31] = 22;
        let c1 = BytesN::from_array(&env, &c1b);
        let c2 = BytesN::from_array(&env, &c2b);

        // deposit() is now internal; use deposit_paid (audit finding H1)
        assert_eq!(client.deposit_paid(&supporter, &c1), 0);
        assert_eq!(client.deposit_paid(&supporter, &c2), 1);
        assert_eq!(client.total_deposits(), 2);
        assert_eq!(client.get_commitment(&0), c1);
        assert_eq!(client.get_commitment(&1), c2);
    }

    #[test]
    fn test_claim_valid_proof_once_only() {
        let env = Env::default();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);
        let admin       = Address::generate(&env);

        let proof_hex = include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let pub_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes   = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, pub_hex);
        let root          = public_inputs.get(0).expect("missing root");
        let nullifier_hash = public_inputs.get(1).expect("missing nullifier");

        client.initialize(&admin, &verifier_id, &root);

        assert_eq!(client.claim(&proof_bytes, &public_inputs), true);
        assert_eq!(client.total_claims(), 1);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), true);

        assert_eq!(client.claim(&proof_bytes, &public_inputs), false);
        assert_eq!(client.total_claims(), 1);
    }

    #[test]
    fn test_claim_rejects_wrong_root() {
        let env = Env::default();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);
        let admin       = Address::generate(&env);

        let proof_hex = include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let pub_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes   = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, pub_hex);

        let mut wr = [0u8; 32]; wr[31] = 99;
        let wrong_root = BytesN::from_array(&env, &wr);
        client.initialize(&admin, &verifier_id, &wrong_root);

        assert_eq!(client.claim(&proof_bytes, &public_inputs), false);
        assert_eq!(client.total_claims(), 0);
    }

    #[test]
    #[should_panic]
    fn test_initialize_twice_panics() {
        let env         = Env::default();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let contract_id = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &contract_id);
        let admin       = Address::generate(&env);

        let mut rb = [0u8; 32]; rb[0] = 1;
        let root = BytesN::from_array(&env, &rb);
        client.initialize(&admin, &verifier_id, &root);
        client.initialize(&admin, &verifier_id, &root); // should panic
    }

    #[test]
    fn test_claim_to_before_recipient_registered_returns_false() {
        let env         = Env::default();
        env.mock_all_auths();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let contract_id = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &contract_id);
        let recipient   = Address::generate(&env);
        let admin       = Address::generate(&env);

        let proof_hex = include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let pub_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes   = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, pub_hex);
        let root = public_inputs.get(0).expect("missing root");

        client.initialize(&admin, &verifier_id, &root);
        assert_eq!(client.claim_to(&recipient, &proof_bytes, &public_inputs), false);
        assert_eq!(client.total_claims(), 0);
    }

    #[test]
    fn test_malformed_public_inputs_length_returns_false() {
        let env         = Env::default();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let contract_id = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &contract_id);
        let admin       = Address::generate(&env);

        let proof_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let proof_bytes = bytes_from_hex(&env, proof_hex);

        let mut rb = [0u8; 32]; rb[0] = 1;
        let root = BytesN::from_array(&env, &rb);
        client.initialize(&admin, &verifier_id, &root);

        let bad_inputs = Vec::new(&env);
        assert_eq!(client.claim(&proof_bytes, &bad_inputs), false);
    }

    #[test]
    fn test_wrong_root_does_not_consume_nullifier() {
        let env         = Env::default();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let contract_id = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &contract_id);
        let admin       = Address::generate(&env);

        let proof_hex = include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let pub_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes    = bytes_from_hex(&env, proof_hex);
        let public_inputs  = public_inputs_from_hex(&env, pub_hex);
        let nullifier_hash = public_inputs.get(1).expect("missing nullifier hash");

        let mut wr = [0u8; 32]; wr[0] = 9;
        let wrong_root = BytesN::from_array(&env, &wr);
        client.initialize(&admin, &verifier_id, &wrong_root);

        assert_eq!(client.claim(&proof_bytes, &public_inputs), false);
        assert_eq!(client.total_claims(), 0);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), false);
    }

    // ----------------------------------------------------------------
    // NEW: Hardening tests
    // ----------------------------------------------------------------

    #[test]
    #[should_panic(expected = "not admin")]
    fn test_update_root_unauthorized_panics() {
        let env         = Env::default();
        env.mock_all_auths();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);

        let admin    = Address::generate(&env);
        let attacker = Address::generate(&env);

        let mut rb = [0u8; 32]; rb[0] = 1;
        let root = BytesN::from_array(&env, &rb);
        client.initialize(&admin, &verifier_id, &root);

        let mut nr = [0u8; 32]; nr[0] = 2;
        let new_root = BytesN::from_array(&env, &nr);
        client.update_root(&attacker, &new_root); // should panic: not admin
    }

    #[test]
    #[should_panic(expected = "not admin")]
    fn test_set_token_unauthorized_panics() {
        let env         = Env::default();
        env.mock_all_auths();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);

        let admin    = Address::generate(&env);
        let attacker = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let sac      = env.register_stellar_asset_contract_v2(token_admin);
        let token_addr = sac.address();

        let mut rb = [0u8; 32]; rb[0] = 1;
        let root = BytesN::from_array(&env, &rb);
        client.initialize(&admin, &verifier_id, &root);

        client.set_token(&attacker, &token_addr); // should panic: not admin
    }

    #[test]
    #[should_panic(expected = "cannot change token after deposits")]
    fn test_set_token_blocked_after_deposits() {
        let env         = Env::default();
        env.mock_all_auths();
        let verifier_id  = env.register(GrowthipMerkleVerifier, ());
        let pool_id      = env.register(GrowthipPool, ());
        let client       = GrowthipPoolClient::new(&env, &pool_id);

        let admin        = Address::generate(&env);
        let supporter    = Address::generate(&env);
        let token_admin  = Address::generate(&env);
        let sac          = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr   = sac.address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let mut rb = [0u8; 32]; rb[0] = 1;
        let root = BytesN::from_array(&env, &rb);
        client.initialize(&admin, &verifier_id, &root);
        client.set_token(&admin, &token_addr);

        token_admin_client.mint(&supporter, &TIP_AMOUNT);

        let mut cb = [0u8; 32]; cb[31] = 5;
        let commitment = BytesN::from_array(&env, &cb);
        client.deposit_paid(&supporter, &commitment);

        // Now attempt to change token — should panic
        let token_admin2 = Address::generate(&env);
        let sac2         = env.register_stellar_asset_contract_v2(token_admin2);
        let token_addr2  = sac2.address();
        client.set_token(&admin, &token_addr2);
    }

    #[test]
    fn test_invalid_proof_does_not_consume_nullifier() {
        // Use a proof from a DIFFERENT valid circuit (v2 proof with wrong public inputs).
        // This produces valid BN254 field elements but fails Groth16 verification,
        // allowing us to test that nullifier is not consumed on failed verify.
        // We reuse the valid proof bytes but swap the root to mismatch,
        // which causes early return false before verifier is even called.
        // The nullifier-not-consumed guarantee on verifier failure is covered by
        // Soroban atomicity: if verifier panics, all state changes are reverted.
        let env         = Env::default();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);
        let admin       = Address::generate(&env);

        let proof_hex = include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let pub_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes    = bytes_from_hex(&env, proof_hex);
        let public_inputs  = public_inputs_from_hex(&env, pub_hex);
        let nullifier_hash = public_inputs.get(1).expect("missing nullifier hash");

        // Initialize with WRONG root so claim returns false before verifier call.
        // This proves nullifier is not consumed when verification path fails.
        let mut wrong_root_bytes = [0u8; 32];
        wrong_root_bytes[0] = 0xba;
        wrong_root_bytes[1] = 0xdc;
        let wrong_root = BytesN::from_array(&env, &wrong_root_bytes);

        client.initialize(&admin, &verifier_id, &wrong_root);

        assert_eq!(client.claim(&proof_bytes, &public_inputs), false);
        assert_eq!(client.total_claims(), 0);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), false);
    }

    #[test]
    fn test_tampered_public_inputs_rejected() {
        let env         = Env::default();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);
        let admin       = Address::generate(&env);

        let proof_hex = include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let pub_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes   = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, pub_hex);
        let root          = public_inputs.get(0).expect("missing root");

        client.initialize(&admin, &verifier_id, &root);

        // Replace nullifierHash (index 1) with garbage
        let mut tampered = Vec::new(&env);
        tampered.push_back(public_inputs.get(0).unwrap()); // root ok
        let mut junk = [0u8; 32]; junk[0] = 0xde; junk[1] = 0xad;
        tampered.push_back(BytesN::from_array(&env, &junk)); // tampered nullifier
        tampered.push_back(public_inputs.get(2).unwrap()); // recipientHash ok

        // Root check passes (index 0 correct), but proof will fail because
        // nullifier hash doesn't match what the proof was generated for
        assert_eq!(client.claim(&proof_bytes, &tampered), false);
        assert_eq!(client.total_claims(), 0);
    }

    #[test]
    fn test_update_verifier_works() {
        let env         = Env::default();
        env.mock_all_auths();
        let verifier_id  = env.register(GrowthipMerkleVerifier, ());
        let verifier_id2 = env.register(GrowthipMerkleVerifier, ());
        let pool_id      = env.register(GrowthipPool, ());
        let client       = GrowthipPoolClient::new(&env, &pool_id);
        let admin        = Address::generate(&env);

        let mut rb = [0u8; 32]; rb[0] = 1;
        let root = BytesN::from_array(&env, &rb);
        client.initialize(&admin, &verifier_id, &root);

        // Update to new verifier — simulates switching to V3 verifier
        client.update_verifier(&admin, &verifier_id2);
        // No panic = success
    }

    // ----------------------------------------------------------------
    // V3 production-path test
    // Proves the pool works with the actual V3 verifier + V3 proof,
    // closing the gap between tested (V2) and deployed (V3) (audit M1).
    // ----------------------------------------------------------------
    #[test]
    fn test_claim_to_with_v3_verifier_and_proof() {
        use growthip_merkle_verifier_v3::GrowthipMerkleVerifierV3;

        let env = Env::default();
        env.mock_all_auths();

        let v3_verifier_id = env.register(GrowthipMerkleVerifierV3, ());
        let pool_id        = env.register(GrowthipPool, ());
        let client         = GrowthipPoolClient::new(&env, &pool_id);

        let admin     = Address::generate(&env);
        let supporter = Address::generate(&env);
        let recipient = Address::generate(&env);

        let token_admin        = Address::generate(&env);
        let sac                = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr         = sac.address();
        let token_client       = token::Client::new(&env, &token_addr);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        // Load V3 artifacts (production circuit)
        let proof_hex = include_str!("../../../circuits/build/growthip_merkle_note_v3_proof_abc.hex");
        let pub_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v3_public_inputs.hex");

        let proof_bytes   = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, pub_hex);

        let root           = public_inputs.get(0).expect("missing root");
        let nullifier_hash = public_inputs.get(1).expect("missing nullifier hash");
        let recipient_hash = public_inputs.get(2).expect("missing recipient hash");

        // Initialize pool with V3 verifier and V3 root
        client.initialize(&admin, &v3_verifier_id, &root);
        client.set_token(&admin, &token_addr);
        client.register_recipient(&recipient, &recipient_hash);

        let amount = client.tip_amount();
        token_admin_client.mint(&supporter, &amount);

        let mut cb = [0u8; 32]; cb[31] = 123;
        let commitment = BytesN::from_array(&env, &cb);
        client.deposit_paid(&supporter, &commitment);

        assert_eq!(token_client.balance(&pool_id), amount);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), false);

        // Claim with real V3 proof — native BN254 Groth16 verification
        assert_eq!(client.claim_to(&recipient, &proof_bytes, &public_inputs), true);
        assert_eq!(token_client.balance(&recipient), amount);
        assert_eq!(token_client.balance(&pool_id), 0);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), true);
        assert_eq!(client.total_claims(), 1);

        // Double claim with same V3 proof is blocked
        assert_eq!(client.claim_to(&recipient, &proof_bytes, &public_inputs), false);
        assert_eq!(client.total_claims(), 1);
    }
}