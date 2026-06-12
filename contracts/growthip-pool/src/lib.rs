#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Bytes, BytesN, Env, Vec};

use growthip_merkle_verifier_v2::GrowthipMerkleVerifierClient;

const TIP_AMOUNT: i128 = 100_000_000; // 10 XLM-style units, 7 decimals

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

    pub fn get_recipient_hash(env: Env, recipient: Address) -> BytesN<32> {
        env.storage()
            .persistent()
            .get(&DataKey::RecipientHash(recipient))
            .expect("recipient hash not found")
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

        Self::deposit(env, commitment)
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

    pub fn deposit(env: Env, commitment: BytesN<32>) -> u32 {
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

        let root = public_inputs.get(0).expect("missing root");
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
            .set(&DataKey::NullifierUsed(nullifier_hash), &true);

        let total: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TotalClaims)
            .unwrap_or(0u32);

        env.storage()
            .instance()
            .set(&DataKey::TotalClaims, &(total + 1));

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
        let clean = hex_str.trim();
        let raw = hex::decode(clean).expect("invalid hex");
        Bytes::from_slice(env, &raw)
    }

    fn public_inputs_from_hex(env: &Env, hex_str: &str) -> Vec<BytesN<32>> {
        let clean = hex_str.trim();

        assert!(
            clean.len() % 64 == 0,
            "public input hex length must be multiple of 64"
        );

        let mut out = Vec::new(env);

        for chunk_start in (0..clean.len()).step_by(64) {
            let chunk = &clean[chunk_start..chunk_start + 64];
            let raw = hex::decode(chunk).expect("invalid public input hex");
            let arr: [u8; 32] = raw.try_into().expect("public input must be 32 bytes");
            out.push_back(BytesN::from_array(env, &arr));
        }

        out
    }

    #[test]
    fn test_claim_to_rejects_wrong_recipient_hash() {
        let env = Env::default();
        env.mock_all_auths();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id = env.register(GrowthipPool, ());
        let client = GrowthipPoolClient::new(&env, &pool_id);

        let admin = Address::generate(&env);
        let supporter = Address::generate(&env);
        let correct_recipient = Address::generate(&env);
        let wrong_recipient = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = sac.address();

        let token_client = token::Client::new(&env, &token_addr);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let proof_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let public_inputs_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, public_inputs_hex);

        let root = public_inputs.get(0).expect("missing root");
        let nullifier_hash = public_inputs.get(1).expect("missing nullifier hash");
        let correct_recipient_hash = public_inputs.get(2).expect("missing recipient hash");

        client.initialize(&admin, &verifier_id, &root);
        client.set_token(&admin, &token_addr);

        client.register_recipient(&correct_recipient, &correct_recipient_hash);

        let mut wrong_hash_bytes = [0u8; 32];
        wrong_hash_bytes[31] = 88;
        let wrong_hash = BytesN::from_array(&env, &wrong_hash_bytes);

        client.register_recipient(&wrong_recipient, &wrong_hash);

        let amount = client.tip_amount();
        token_admin_client.mint(&supporter, &amount);

        let mut commitment_bytes = [0u8; 32];
        commitment_bytes[31] = 99;
        let commitment = BytesN::from_array(&env, &commitment_bytes);

        client.deposit_paid(&supporter, &commitment);

        assert_eq!(token_client.balance(&pool_id), amount);
        assert_eq!(token_client.balance(&wrong_recipient), 0);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), false);

        // Wrong recipient cannot use a proof bound to another recipientHash.
        assert_eq!(
            client.claim_to(&wrong_recipient, &proof_bytes, &public_inputs),
            false
        );

        assert_eq!(token_client.balance(&pool_id), amount);
        assert_eq!(token_client.balance(&wrong_recipient), 0);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), false);
        assert_eq!(client.total_claims(), 0);

        // Correct recipient can still claim after the failed wrong attempt.
        assert_eq!(
            client.claim_to(&correct_recipient, &proof_bytes, &public_inputs),
            true
        );

        assert_eq!(token_client.balance(&correct_recipient), amount);
        assert_eq!(token_client.balance(&pool_id), 0);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), true);
        assert_eq!(client.total_claims(), 1);
    }

    #[test]
    fn test_paid_deposit_and_claim_to_recipient() {
        let env = Env::default();
        env.mock_all_auths();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id = env.register(GrowthipPool, ());
        let client = GrowthipPoolClient::new(&env, &pool_id);

        let admin = Address::generate(&env);
        let supporter = Address::generate(&env);
        let recipient = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = sac.address();

        let token_client = token::Client::new(&env, &token_addr);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let proof_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let public_inputs_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, public_inputs_hex);

        let root = public_inputs.get(0).expect("missing root");
        let recipient_hash = public_inputs.get(2).expect("missing recipient hash");

        client.initialize(&admin, &verifier_id, &root);
        client.set_token(&admin, &token_addr);
        client.register_recipient(&recipient, &recipient_hash);

        let amount = client.tip_amount();

        token_admin_client.mint(&supporter, &amount);

        assert_eq!(token_client.balance(&supporter), amount);
        assert_eq!(token_client.balance(&pool_id), 0);
        assert_eq!(token_client.balance(&recipient), 0);

        let mut commitment_bytes = [0u8; 32];
        commitment_bytes[31] = 77;
        let commitment = BytesN::from_array(&env, &commitment_bytes);

        let index = client.deposit_paid(&supporter, &commitment);

        assert_eq!(index, 0);
        assert_eq!(client.total_deposits(), 1);
        assert_eq!(client.get_commitment(&0), commitment);

        assert_eq!(token_client.balance(&supporter), 0);
        assert_eq!(token_client.balance(&pool_id), amount);

        assert_eq!(
            client.claim_to(&recipient, &proof_bytes, &public_inputs),
            true
        );

        assert_eq!(token_client.balance(&recipient), amount);
        assert_eq!(token_client.balance(&pool_id), 0);

        // Same proof cannot claim twice.
        assert_eq!(
            client.claim_to(&recipient, &proof_bytes, &public_inputs),
            false
        );
        assert_eq!(token_client.balance(&recipient), amount);
    }

    #[test]
    fn test_deposit_stores_commitment() {
        let env = Env::default();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id = env.register(GrowthipPool, ());
        let client = GrowthipPoolClient::new(&env, &pool_id);

        let admin = Address::generate(&env);

        let mut root_bytes = [0u8; 32];
        root_bytes[31] = 1;
        let root = BytesN::from_array(&env, &root_bytes);

        client.initialize(&admin, &verifier_id, &root);

        let mut commitment_1_bytes = [0u8; 32];
        commitment_1_bytes[31] = 11;
        let commitment_1 = BytesN::from_array(&env, &commitment_1_bytes);

        let mut commitment_2_bytes = [0u8; 32];
        commitment_2_bytes[31] = 22;
        let commitment_2 = BytesN::from_array(&env, &commitment_2_bytes);

        let index_1 = client.deposit(&commitment_1);
        let index_2 = client.deposit(&commitment_2);

        assert_eq!(index_1, 0);
        assert_eq!(index_2, 1);

        assert_eq!(client.total_deposits(), 2);
        assert_eq!(client.get_commitment(&0), commitment_1);
        assert_eq!(client.get_commitment(&1), commitment_2);
    }

    #[test]
    fn test_claim_valid_proof_once_only() {
        let env = Env::default();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id = env.register(GrowthipPool, ());
        let client = GrowthipPoolClient::new(&env, &pool_id);

        let admin = Address::generate(&env);

        let proof_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let public_inputs_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, public_inputs_hex);

        let root = public_inputs.get(0).expect("missing root");
        let nullifier_hash = public_inputs.get(1).expect("missing nullifier");

        client.initialize(&admin, &verifier_id, &root);

        assert_eq!(client.current_root(), root);
        assert_eq!(client.total_claims(), 0);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), false);

        assert_eq!(client.claim(&proof_bytes, &public_inputs), true);

        assert_eq!(client.total_claims(), 1);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), true);

        // Same proof/note cannot be claimed twice.
        assert_eq!(client.claim(&proof_bytes, &public_inputs), false);

        assert_eq!(client.total_claims(), 1);
    }

    #[test]
    fn test_claim_rejects_wrong_root() {
        let env = Env::default();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id = env.register(GrowthipPool, ());
        let client = GrowthipPoolClient::new(&env, &pool_id);

        let admin = Address::generate(&env);

        let proof_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let public_inputs_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, public_inputs_hex);

        let mut wrong_root_bytes = [0u8; 32];
        wrong_root_bytes[31] = 99;
        let wrong_root = BytesN::from_array(&env, &wrong_root_bytes);

        client.initialize(&admin, &verifier_id, &wrong_root);

        assert_eq!(client.claim(&proof_bytes, &public_inputs), false);
        assert_eq!(client.total_claims(), 0);
    }

    #[test]
    #[should_panic]
    fn test_initialize_twice_panics() {
        let env = Env::default();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let contract_id = env.register(GrowthipPool, ());
        let client = GrowthipPoolClient::new(&env, &contract_id);

        let admin = Address::generate(&env);

        let mut root_bytes = [0u8; 32];
        root_bytes[0] = 1;
        let root = BytesN::from_array(&env, &root_bytes);

        client.initialize(&admin, &verifier_id, &root);
        client.initialize(&admin, &verifier_id, &root);
    }

    #[test]
    fn test_claim_to_before_recipient_registered_returns_false() {
        let env = Env::default();
        env.mock_all_auths();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let contract_id = env.register(GrowthipPool, ());
        let client = GrowthipPoolClient::new(&env, &contract_id);

        let recipient = Address::generate(&env);
        let admin = Address::generate(&env);

        let proof_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let public_inputs_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, public_inputs_hex);

        let root = public_inputs.get(0).expect("missing root");

        client.initialize(&admin, &verifier_id, &root);

        assert_eq!(
            client.claim_to(&recipient, &proof_bytes, &public_inputs),
            false
        );
        assert_eq!(client.total_claims(), 0);
    }

    #[test]
    fn test_malformed_public_inputs_length_returns_false() {
        let env = Env::default();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let contract_id = env.register(GrowthipPool, ());
        let client = GrowthipPoolClient::new(&env, &contract_id);

        let admin = Address::generate(&env);

        let proof_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let proof_bytes = bytes_from_hex(&env, proof_hex);

        let mut root_bytes = [0u8; 32];
        root_bytes[0] = 1;
        let root = BytesN::from_array(&env, &root_bytes);

        let bad_inputs = Vec::new(&env);

        client.initialize(&admin, &verifier_id, &root);

        assert_eq!(client.claim(&proof_bytes, &bad_inputs), false);
    }

    #[test]
    fn test_wrong_root_does_not_consume_nullifier() {
        let env = Env::default();

        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let contract_id = env.register(GrowthipPool, ());
        let client = GrowthipPoolClient::new(&env, &contract_id);

        let admin = Address::generate(&env);

        let proof_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let public_inputs_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, public_inputs_hex);
        let nullifier_hash = public_inputs.get(1).expect("missing nullifier hash");

        let mut wrong_root_bytes = [0u8; 32];
        wrong_root_bytes[0] = 9;
        let wrong_root = BytesN::from_array(&env, &wrong_root_bytes);

        client.initialize(&admin, &verifier_id, &wrong_root);

        assert_eq!(client.claim(&proof_bytes, &public_inputs), false);
        assert_eq!(client.total_claims(), 0);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), false);
    }

}
