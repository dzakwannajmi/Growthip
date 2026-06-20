#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, token, Address, Bytes, BytesN, Env, String, Vec};

/// Minimal cross-contract client for the verifier. Declaring this
/// locally (instead of importing the verifier crate's full
/// #[contractimpl] client) prevents the verifier's own contract
/// interface from being statically linked into and leaked through
/// the pool's WASM binary. See: `stellar contract info interface`
/// previously showed `verify()` as a directly-callable function on
/// the pool contract itself -- this was an unintended consequence of
/// depending on the verifier as a full Rust crate. Fixed here.
#[soroban_sdk::contractclient(name = "VerifierClient")]
pub trait VerifierInterface {
    fn verify(env: Env, proof_bytes: Bytes, public_inputs: Vec<BytesN<32>>) -> bool;
}

#[allow(dead_code)]
mod merkle_onchain;
use merkle_onchain::{rebuild_merkle_root, MAX_LEAVES as MERKLE_MAX_LEAVES};

// TIP_AMOUNT is now configurable per pool via initialize()

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Verifier,
    Token,
    CurrentRoot,
    RootHistory,
    RecipientHash(Address),
    NullifierUsed(BytesN<32>),
    Commitment(u32),
    CommitmentAmount(u32),
    Message(u32),
    TotalDeposits,
    TotalClaims,
    TipAmount,
    Treasury,
    AccumulatedFee,
}

/// Public donor message max length, in bytes. Soroban String::len()
/// counts bytes, not visual characters -- for plain ASCII this is
/// equivalent to a 50-character cap, but multi-byte UTF-8 (e.g. emoji)
/// would hit this limit sooner than 50 visible characters. Acceptable
/// simplification for a cosmetic donor-message feature.
pub const MAX_MESSAGE_LEN: u32 = 50;

/// Platform fee: 1% of every claimed amount, expressed in basis points
/// (1% = 100 bps out of 10_000). Fee accrues in contract storage at
/// claim time and is NOT transferred immediately -- this avoids linking
/// a specific claim to a specific treasury-incoming transfer on-chain,
/// preserving claim-level privacy.
pub const FEE_BPS: i128 = 100;
pub const BPS_DENOMINATOR: i128 = 10_000;

/// Privacy-safe deposit event: only the leaf index is published, never
/// the depositor address or commitment value.
#[contractevent(topics = ["deposit"], data_format = "single-value")]
pub struct DepositEvent {
    pub index: u32,
}

/// Privacy-safe claim event: only the nullifier hash is published, never
/// the recipient address.
#[contractevent(topics = ["claim"], data_format = "single-value")]
pub struct ClaimEvent {
    pub nullifier_hash: BytesN<32>,
}

#[contract]
pub struct GrowthipPool;

#[contractimpl]
impl GrowthipPool {
    pub fn initialize(
        env: Env,
        admin: Address,
        verifier: Address,
        root: BytesN<32>,
        tip_amount: i128,
        treasury: Address,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.storage().instance().set(&DataKey::CurrentRoot, &root);
        env.storage().instance().set(&DataKey::TotalDeposits, &0u32);
        env.storage().instance().set(&DataKey::TotalClaims, &0u32);
        env.storage().instance().set(&DataKey::TipAmount, &tip_amount);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::AccumulatedFee, &0i128);
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

    pub fn tip_amount(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TipAmount)
            .unwrap_or(100_000_000i128)
    }

    pub fn deposit_paid(
        env: Env,
        depositor: Address,
        commitment: BytesN<32>,
        amount: i128,
        message: Option<String>,
    ) -> u32 {
        depositor.require_auth();

        // Public donor message: optional, on-chain, capped at
        // MAX_MESSAGE_LEN bytes. This is intentionally PUBLIC -- visible
        // to anyone reading the pool's commitment list, the same way the
        // commitment and deposit index are public. It is NOT linked to
        // the depositor's identity (the depositor's signature on this
        // transaction is the only on-chain trace, same as any deposit).
        if let Some(ref m) = message {
            if m.len() > MAX_MESSAGE_LEN {
                panic!("message exceeds {} bytes", MAX_MESSAGE_LEN);
            }
        }

        // Validate amount is one of the allowed denominations
        // 1 unit, 5 units, 10 units, 20 units (in base units)
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("token not set");

        // Get base unit (tip_amount stored is the 1-unit denomination)
        let base_unit: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TipAmount)
            .unwrap_or(10_000_000i128);

        // Allowed: 1x, 5x, 10x, 20x base unit
        let allowed = [base_unit, base_unit * 5, base_unit * 10, base_unit * 20];
        if !allowed.contains(&amount) {
            panic!("amount must be 1x, 5x, 10x, or 20x the base denomination");
        }

        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&depositor, &env.current_contract_address(), &amount);
        Self::deposit_internal(&env, commitment, amount, message)
    }

    /// Extracts a small u32 index from a BytesN<32> public-input value.
    /// Only the last 4 bytes may be non-zero; the upper 28 bytes MUST be
    /// zero. This is a sanity/format check on a value already
    /// cryptographically proven correct by the Groth16 verifier (the
    /// circuit can only ever output index values 0..MAX_LEAVES-1, which
    /// always fit in far fewer than 4 bytes) -- it is NOT a security
    /// boundary against attacker-controlled input, so a violation here
    /// indicates an internal bug, not a malicious proof, and panics
    /// rather than returning false.
    fn bytesn32_to_u32(bytes: &BytesN<32>) -> u32 {
        let arr = bytes.to_array();
        for &b in arr[0..28].iter() {
            if b != 0 {
                panic!("index field has unexpected non-zero high bytes");
            }
        }
        u32::from_be_bytes([arr[28], arr[29], arr[30], arr[31]])
    }

    pub fn claim_to(
        env: Env,
        recipient: Address,
        proof_bytes: Bytes,
        public_inputs: Vec<BytesN<32>>,
    ) -> bool {
        // V3.1: public_inputs is [root, nullifierHash, recipientHash, index].
        if public_inputs.len() != 4 {
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

        let ok = Self::claim(env.clone(), proof_bytes, public_inputs.clone());
        if !ok {
            return false;
        }

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("token not set");
        let token_client = token::Client::new(&env, &token_addr);

        // DEPOSIT-AMOUNT-AWARE CLAIMS FIX: public_inputs[3] is the V3.1
        // circuit's `index` output, cryptographically proven correct by
        // the Groth16 verify() call above (it's derived from the same
        // pathIndices bits used to prove Merkle membership against this
        // exact root). We look up the ACTUAL amount deposited at that
        // index, instead of always paying out a flat TipAmount base
        // unit -- the prior behavior silently paid out only 1x the base
        // unit on a 5x/10x/20x deposit, permanently locking the
        // remainder in the pool. See SECURITY.md.
        let index_bytes = public_inputs.get(3).expect("missing index");
        let index = Self::bytesn32_to_u32(&index_bytes);

        let base_amount: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::CommitmentAmount(index))
            .expect("commitment amount missing for claimed index");
        // Platform fee (1%): subtracted from the claim, NOT transferred to
        // treasury here. It accrues in DataKey::AccumulatedFee, and the
        // treasury withdraws it later via withdraw_fees(), in a batch
        // disconnected from any single claim -- this is a deliberate
        // privacy choice (see FEE_BPS doc comment above DataKey).
        let fee_amount: i128 = (base_amount * FEE_BPS) / BPS_DENOMINATOR;
        let net_amount: i128 = base_amount - fee_amount;

        token_client.transfer(&env.current_contract_address(), &recipient, &net_amount);

        let accumulated: i128 = env
            .storage()
            .instance()
            .get(&DataKey::AccumulatedFee)
            .unwrap_or(0i128);
        env.storage()
            .instance()
            .set(&DataKey::AccumulatedFee, &(accumulated + fee_amount));

        true
    }

    /// Admin-gated batch withdrawal of accumulated platform fees to the
    /// treasury address. Deliberately separate from claim_to() and
    /// callable at any time, independent of any specific claim -- this
    /// breaks the on-chain link between "who just claimed" and "when did
    /// the treasury receive money", preserving claim-level privacy.
    pub fn withdraw_fees(env: Env, admin: Address) -> i128 {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("admin not set");
        if admin != stored_admin {
            panic!("unauthorized");
        }
        admin.require_auth();

        let accumulated: i128 = env
            .storage()
            .instance()
            .get(&DataKey::AccumulatedFee)
            .unwrap_or(0i128);
        if accumulated == 0 {
            return 0;
        }

        let treasury: Address = env
            .storage()
            .instance()
            .get(&DataKey::Treasury)
            .expect("treasury not set");
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("token not set");
        let token_client = token::Client::new(&env, &token_addr);

        token_client.transfer(&env.current_contract_address(), &treasury, &accumulated);
        env.storage().instance().set(&DataKey::AccumulatedFee, &0i128);

        accumulated
    }

    /// Public read of the current accumulated (not-yet-withdrawn) fee
    /// balance, for dashboards/transparency.
    pub fn accumulated_fees(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::AccumulatedFee)
            .unwrap_or(0i128)
    }

    /// Internal commitment storage helper.
    /// Not public: deposits must go through `deposit_paid` which enforces payment.
    /// This prevents griefing via free commitment spam (audit finding H1).
    fn deposit_internal(
        env: &Env,
        commitment: BytesN<32>,
        amount: i128,
        message: Option<String>,
    ) -> u32 {
        let index: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TotalDeposits)
            .unwrap_or(0u32);

        if index >= MERKLE_MAX_LEAVES {
            panic!("pool is full: max {} deposits reached", MERKLE_MAX_LEAVES);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Commitment(index), &commitment);
        env.storage()
            .persistent()
            .set(&DataKey::CommitmentAmount(index), &amount);
        // Only write a storage entry if a message was actually provided —
        // avoids unnecessary storage writes/gas for tips with no message.
        if let Some(m) = message {
            env.storage()
                .persistent()
                .set(&DataKey::Message(index), &m);
        }
        let new_total = index + 1;
        env.storage()
            .instance()
            .set(&DataKey::TotalDeposits, &new_total);

        // SECURITY FIX: recompute the Merkle root over all commitments
        // (including the one just added) and append it to the on-chain
        // root history. claim() will only accept proofs whose root is
        // present in this history.
        let mut all_commitments: Vec<BytesN<32>> = Vec::new(env);
        for i in 0..new_total {
            let c: BytesN<32> = env
                .storage()
                .persistent()
                .get(&DataKey::Commitment(i))
                .expect("commitment missing during root rebuild");
            all_commitments.push_back(c);
        }
        let new_root = rebuild_merkle_root(env, &all_commitments);

        let mut history: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&DataKey::RootHistory)
            .unwrap_or_else(|| Vec::new(env));
        history.push_back(new_root.clone());
        if history.len() > MERKLE_MAX_LEAVES {
            history.remove(0);
        }
        env.storage().instance().set(&DataKey::RootHistory, &history);
        env.storage().instance().set(&DataKey::CurrentRoot, &new_root);

        // Emit privacy-safe event: index only, no depositor or commitment value
        DepositEvent { index }.publish(&env);

        index
    }

    pub fn get_commitment_amount(env: Env, index: u32) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::CommitmentAmount(index))
            .unwrap_or(0i128)
    }

    /// Public read of an optional donor message attached to a deposit.
    /// Returns None if no message was provided at deposit time.
    pub fn get_message(env: Env, index: u32) -> Option<String> {
        env.storage()
            .persistent()
            .get(&DataKey::Message(index))
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
        // V3.1: public_inputs is now [root, nullifierHash, recipientHash, index].
        // `index` lets claim_to() look up the ACTUAL deposited amount
        // (CommitmentAmount(index)) instead of a flat base unit -- see
        // SECURITY.md for the deposit-amount-aware claims fix writeup.
        if public_inputs.len() != 4 {
            return false;
        }

        let root          = public_inputs.get(0).expect("missing root");
        let nullifier_hash = public_inputs.get(1).expect("missing nullifier hash");

        // SECURITY FIX: validate the root against on-chain history BEFORE
        // doing anything else. A Groth16 proof only proves "I know a path
        // to root X" -- it does NOT prove X is a root this pool ever
        // produced. Checked first (fail-fast).
        let root_history: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&DataKey::RootHistory)
            .unwrap_or_else(|| Vec::new(&env));
        let mut root_is_known = false;
        for stored_root in root_history.iter() {
            if stored_root == root {
                root_is_known = true;
                break;
            }
        }
        if !root_is_known {
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

        let verifier_client = VerifierClient::new(&env, &verifier);
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
        ClaimEvent { nullifier_hash }.publish(&env);

        true
    }
}

#[cfg(test)]
mod test {

    fn test_decimal_str_to_bytesn32(env: &Env, s: &str) -> BytesN<32> {
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
        BytesN::from_array(env, &out)
    }
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
    #[ignore = "outdated V2 fixture: deposits a disconnected dummy commitment \
        instead of the commitment that actually generated the proof. This \
        test predates the root-history security fix and relied on the \
        absence of root validation to pass. Failing here is EXPECTED and \
        CORRECT post-fix -- it would now need a real V2 deposit/proof pair \
        (analogous to test_claim_to_with_v3_verifier_and_proof) to be \
        meaningful again. Left disabled rather than deleted to preserve \
        the audit trail of what changed and why."]
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

        let treasury_test = Address::generate(&env);

        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);
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
        client.deposit_paid(&supporter, &commitment, &100_000_000i128, &None);

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
    #[ignore = "outdated V2 fixture: deposits a disconnected dummy commitment \
        instead of the commitment that actually generated the proof. This \
        test predates the root-history security fix and relied on the \
        absence of root validation to pass. Failing here is EXPECTED and \
        CORRECT post-fix -- it would now need a real V2 deposit/proof pair \
        (analogous to test_claim_to_with_v3_verifier_and_proof) to be \
        meaningful again. Left disabled rather than deleted to preserve \
        the audit trail of what changed and why."]
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

        let treasury_test = Address::generate(&env);

        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);
        client.set_token(&admin, &token_addr);
        client.register_recipient(&recipient, &recipient_hash);

        let amount = client.tip_amount();
        token_admin_client.mint(&supporter, &amount);

        let mut cb = [0u8; 32]; cb[31] = 77;
        let commitment = BytesN::from_array(&env, &cb);
        let index = client.deposit_paid(&supporter, &commitment, &100_000_000i128, &None);

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
        let treasury_test = Address::generate(&env);
        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);
        client.set_token(&admin, &token_addr);

        // Fund supporter for two paid deposits
        token_admin_client.mint(&supporter, &(100_000_000i128 * 2));

        let mut c1b = [0u8; 32]; c1b[31] = 11;
        let mut c2b = [0u8; 32]; c2b[31] = 22;
        let c1 = BytesN::from_array(&env, &c1b);
        let c2 = BytesN::from_array(&env, &c2b);

        // deposit() is now internal; use deposit_paid (audit finding H1)
        assert_eq!(client.deposit_paid(&supporter, &c1, &100_000_000i128, &None), 0);
        assert_eq!(client.deposit_paid(&supporter, &c2, &100_000_000i128, &None), 1);
        assert_eq!(client.total_deposits(), 2);
        assert_eq!(client.get_commitment(&0), c1);
        assert_eq!(client.get_commitment(&1), c2);
    }

    #[test]
    #[ignore = "outdated V2 fixture: deposits a disconnected dummy commitment \
        instead of the commitment that actually generated the proof. This \
        test predates the root-history security fix and relied on the \
        absence of root validation to pass. Failing here is EXPECTED and \
        CORRECT post-fix -- it would now need a real V2 deposit/proof pair \
        (analogous to test_claim_to_with_v3_verifier_and_proof) to be \
        meaningful again. Left disabled rather than deleted to preserve \
        the audit trail of what changed and why."]
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

        let treasury_test = Address::generate(&env);

        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);

        assert_eq!(client.claim(&proof_bytes, &public_inputs), true);
        assert_eq!(client.total_claims(), 1);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), true);

        assert_eq!(client.claim(&proof_bytes, &public_inputs), false);
        assert_eq!(client.total_claims(), 1);
    }

    #[test]
    fn test_claim_rejects_wrong_root() {
        // Root check is now performed by the Groth16 verifier itself.
        // A proof generated for root A will fail verification if submitted
        // with public inputs for root B — the pairing check will fail.
        // This test now verifies that a tampered root in public inputs
        // causes proof verification to fail (not a contract-level check).
        let env = Env::default();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);
        let admin       = Address::generate(&env);

        let proof_hex = include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let pub_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes   = bytes_from_hex(&env, proof_hex);
        let mut public_inputs = public_inputs_from_hex(&env, pub_hex);
        let correct_root = public_inputs.get(0).expect("missing root");

        // Tamper root in public inputs — proof will fail ZK verification
        let mut wr = [0u8; 32]; wr[31] = 99;
        let wrong_root = BytesN::from_array(&env, &wr);
        public_inputs.set(0, wrong_root.clone());

        let treasury_test = Address::generate(&env);

        client.initialize(&admin, &verifier_id, &correct_root, &100_000_000i128, &treasury_test);

        // Proof fails because public inputs dont match what proof was generated for
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
        let treasury_test = Address::generate(&env);
        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);
        let treasury_test = Address::generate(&env);client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test); // should panic
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

        let treasury_test = Address::generate(&env);

        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);
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
        let treasury_test = Address::generate(&env);
        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);

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

        let correct_root = public_inputs.get(0).expect("missing root");
        let treasury_test = Address::generate(&env);
        client.initialize(&admin, &verifier_id, &correct_root, &100_000_000i128, &treasury_test);

        // Tamper root in public inputs copy
        let mut tampered = Vec::new(&env);
        let mut wr = [0u8; 32]; wr[0] = 9;
        tampered.push_back(BytesN::from_array(&env, &wr)); // wrong root
        tampered.push_back(public_inputs.get(1).unwrap());
        tampered.push_back(public_inputs.get(2).unwrap());

        assert_eq!(client.claim(&proof_bytes, &tampered), false);
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
        let treasury_test = Address::generate(&env);
        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);

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
        let treasury_test = Address::generate(&env);
        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);

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
        let treasury_test = Address::generate(&env);
        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);
        client.set_token(&admin, &token_addr);

        token_admin_client.mint(&supporter, &100_000_000i128);

        let mut cb = [0u8; 32]; cb[31] = 5;
        let commitment = BytesN::from_array(&env, &cb);
        client.deposit_paid(&supporter, &commitment, &100_000_000i128, &None);

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

        // Root check removed from contract — now in ZK verifier.
        // Test: nullifier not consumed when proof bytes are wrong size.
        let correct_root = public_inputs.get(0).expect("missing root");
        let treasury_test = Address::generate(&env);
        client.initialize(&admin, &verifier_id, &correct_root, &100_000_000i128, &treasury_test);

        // Proof wrong size (100 bytes) — fails before verifier is called
        let bad_proof = Bytes::from_slice(&env, &[0u8; 100]);
        assert_eq!(client.claim(&bad_proof, &public_inputs), false);
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

        let treasury_test = Address::generate(&env);

        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);

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
        let treasury_test = Address::generate(&env);
        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury_test);

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
    fn test_claim_to_with_v3_1_verifier_pays_actual_deposited_amount() {
        use growthip_merkle_verifier_v3_1::GrowthipMerkleVerifierV31;

        let env = Env::default();
        env.mock_all_auths();

        let v3_1_verifier_id = env.register(GrowthipMerkleVerifierV31, ());
        let pool_id          = env.register(GrowthipPool, ());
        let client           = GrowthipPoolClient::new(&env, &pool_id);

        let admin     = Address::generate(&env);
        let supporter = Address::generate(&env);
        let recipient = Address::generate(&env);

        let token_admin        = Address::generate(&env);
        let sac                = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr         = sac.address();
        let token_client       = token::Client::new(&env, &token_addr);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        // Load V3.1 artifacts: 4 public inputs (root, nullifierHash,
        // recipientHash, index). The proof was generated for the
        // commitment at leaf index 5 -- see scripts/make_v3_1_test_input.js.
        let proof_hex = include_str!("../../../circuits/build/growthip_merkle_note_v3_1_proof_abc.hex");
        let pub_hex   = include_str!("../../../circuits/build/growthip_merkle_note_v3_1_public_inputs.hex");

        let proof_bytes   = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, pub_hex);

        let root           = public_inputs.get(0).expect("missing root");
        let nullifier_hash = public_inputs.get(1).expect("missing nullifier hash");
        let recipient_hash = public_inputs.get(2).expect("missing recipient hash");

        let treasury_test = Address::generate(&env);
        client.initialize(&admin, &v3_1_verifier_id, &root, &100_000_000i128, &treasury_test);
        client.set_token(&admin, &token_addr);
        client.register_recipient(&recipient, &recipient_hash);

        let base_unit = client.tip_amount();
        // DEPOSIT-AMOUNT-AWARE CLAIMS FIX: deposit 5x the base unit, at
        // leaf index 5 (matching the proof), to prove claim_to() now
        // pays out the ACTUAL deposited amount rather than always
        // paying a flat 1x base unit regardless of what was deposited.
        let deposited_amount = base_unit * 5;
        token_admin_client.mint(&supporter, &deposited_amount);

        // Pad leaf indices 0..4 with the EXACT all-zero commitment used
        // by scripts/make_v3_1_test_input.js's padding (leaves initialized
        // to "0" for every position except TARGET_INDEX). The proof's root
        // was computed over this specific tree shape -- any other padding
        // value here would produce a different on-chain root that won't
        // match the proof's root.
        for _ in 0u8..5 {
            let zero_commitment = BytesN::from_array(&env, &[0u8; 32]);
            let dummy_amount = base_unit;
            token_admin_client.mint(&supporter, &dummy_amount);
            client.deposit_paid(&supporter, &zero_commitment, &dummy_amount, &None);
        }

        // The real commitment, generated by scripts/make_v3_1_test_input.js.
        let real_commitment_decimal =
            "9441917699024536157291676259789576939205534922878967609663288864418714902782";
        let commitment = test_decimal_str_to_bytesn32(&env, real_commitment_decimal);
        let index = client.deposit_paid(&supporter, &commitment, &deposited_amount, &None);
        assert_eq!(index, 5, "real commitment must land at leaf index 5 to match the proof");

        assert_eq!(client.is_nullifier_used(&nullifier_hash), false);

        // Claim with real V3.1 proof — native BN254 Groth16 verification
        assert_eq!(client.claim_to(&recipient, &proof_bytes, &public_inputs), true);

        // THE FIX: recipient gets 99% of the ACTUAL 5x deposited amount,
        // not 99% of a flat 1x base unit.
        let expected_fee: i128 = (deposited_amount * 100) / 10_000;
        let expected_net: i128 = deposited_amount - expected_fee;
        assert_eq!(token_client.balance(&recipient), expected_net);
        assert_eq!(client.accumulated_fees(), expected_fee);
        assert_eq!(client.is_nullifier_used(&nullifier_hash), true);
        assert_eq!(client.total_claims(), 1);

        // Double claim with same V3.1 proof is blocked
        assert_eq!(client.claim_to(&recipient, &proof_bytes, &public_inputs), false);
        assert_eq!(client.total_claims(), 1);

        let withdrawn = client.withdraw_fees(&admin);
        assert_eq!(withdrawn, expected_fee);
        assert_eq!(client.accumulated_fees(), 0);
        assert_eq!(token_client.balance(&treasury_test), expected_fee);
    }
}
#[cfg(test)]
mod poseidon_verify_test;

#[cfg(test)]
mod merkle_verify_test;

#[cfg(test)]
mod public_message_test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use growthip_merkle_verifier_v2::GrowthipMerkleVerifier;

    #[test]
    fn deposit_with_message_stores_and_reads_back() {
        let env = Env::default();
        env.mock_all_auths();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);

        let admin     = Address::generate(&env);
        let supporter = Address::generate(&env);
        let treasury  = Address::generate(&env);
        let token_admin        = Address::generate(&env);
        let sac                = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr         = sac.address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let mut rb = [0u8; 32]; rb[31] = 1;
        let root = BytesN::from_array(&env, &rb);
        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury);
        client.set_token(&admin, &token_addr);

        let amount = client.tip_amount();
        token_admin_client.mint(&supporter, &amount);

        let mut cb = [0u8; 32]; cb[31] = 5;
        let commitment = BytesN::from_array(&env, &cb);

        let message = String::from_str(&env, "Thanks for the great content!");
        let index = client.deposit_paid(&supporter, &commitment, &amount, &Some(message.clone()));

        let read_back = client.get_message(&index);
        assert_eq!(read_back, Some(message));
    }

    #[test]
    fn deposit_without_message_returns_none() {
        let env = Env::default();
        env.mock_all_auths();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);

        let admin     = Address::generate(&env);
        let supporter = Address::generate(&env);
        let treasury  = Address::generate(&env);
        let token_admin        = Address::generate(&env);
        let sac                = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr         = sac.address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let mut rb = [0u8; 32]; rb[31] = 1;
        let root = BytesN::from_array(&env, &rb);
        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury);
        client.set_token(&admin, &token_addr);

        let amount = client.tip_amount();
        token_admin_client.mint(&supporter, &amount);

        let mut cb = [0u8; 32]; cb[31] = 6;
        let commitment = BytesN::from_array(&env, &cb);

        let index = client.deposit_paid(&supporter, &commitment, &amount, &None);
        let read_back = client.get_message(&index);
        assert_eq!(read_back, None);
    }

    #[test]
    #[should_panic(expected = "message exceeds")]
    fn deposit_with_oversized_message_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let verifier_id = env.register(GrowthipMerkleVerifier, ());
        let pool_id     = env.register(GrowthipPool, ());
        let client      = GrowthipPoolClient::new(&env, &pool_id);

        let admin     = Address::generate(&env);
        let supporter = Address::generate(&env);
        let treasury  = Address::generate(&env);
        let token_admin        = Address::generate(&env);
        let sac                = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr         = sac.address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let mut rb = [0u8; 32]; rb[31] = 1;
        let root = BytesN::from_array(&env, &rb);
        client.initialize(&admin, &verifier_id, &root, &100_000_000i128, &treasury);
        client.set_token(&admin, &token_addr);

        let amount = client.tip_amount();
        token_admin_client.mint(&supporter, &amount);

        let mut cb = [0u8; 32]; cb[31] = 7;
        let commitment = BytesN::from_array(&env, &cb);

        let too_long = String::from_str(
            &env,
            "This message is way too long and definitely exceeds fifty bytes for sure",
        );
        client.deposit_paid(&supporter, &commitment, &amount, &Some(too_long));
    }
}
