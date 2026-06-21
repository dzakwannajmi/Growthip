#![no_std]

//! GrowthipCreatorRegistry
//!
//! A small, deliberately separate contract from growthip-pool. Holds two
//! pieces of GLOBAL creator identity state, independent of which token
//! pool a creator receives tips through:
//!   - an encryption public key (X25519), used by supporters' browsers to
//!     encrypt private notes for that creator
//!   - a one-time "premium" activation flag, gating private-note delivery
//!     and dashboard analytics
//!
//! Deliberately NOT part of growthip-pool:
//!   - growthip-pool is deployed once per token (XLM, USDC, ...). Premium
//!     status is a property of the CREATOR, not of "the creator within
//!     one specific pool" -- putting it in the pool would mean paying the
//!     activation fee once per token, which is not the intended pricing
//!     model.
//!   - Nothing in deposit_paid()/claim_to()'s ZK-privacy-sensitive logic
//!     needs this data. The minimum-tip-for-private-note rule is enforced
//!     client-side only (by design, to avoid adding contract complexity
//!     for a non-security-critical UX rule). Keeping this contract
//!     separate means growthip-pool (already finalized at V3.1) never
//!     needs to be touched or redeployed for this feature.

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, token, Address, BytesN, Env};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Treasury,
    PremiumFee,
    AccumulatedFee,
    EncryptionPubKey(Address),
    PremiumActivated(Address),
}

/// Default one-time premium activation fee: 6 XLM (in stroops, 7 decimals).
/// Overridable post-deploy via update_premium_fee() (admin-gated), in case
/// the price needs adjusting without a full redeploy.
pub const DEFAULT_PREMIUM_FEE: i128 = 60_000_000;

/// Emitted when a creator activates premium for the first time. Privacy-
/// safe by construction: activating premium already requires the
/// creator's own signature (require_auth), so there is no additional
/// anonymity to protect here, unlike pool deposits/claims.
#[contractevent(topics = ["premium_activated"], data_format = "single-value")]
pub struct PremiumActivatedEvent {
    pub recipient: Address,
}

#[contract]
pub struct GrowthipCreatorRegistry;

#[contractimpl]
impl GrowthipCreatorRegistry {
    /// One-time setup. `token_addr` is the asset premium fees are paid in
    /// (the native XLM SAC, in Growthip's case -- premium status is global
    /// regardless of which token(s) a creator later receives tips through).
    pub fn initialize(env: Env, admin: Address, token_addr: Address, treasury: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token_addr);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage()
            .instance()
            .set(&DataKey::PremiumFee, &DEFAULT_PREMIUM_FEE);
        env.storage().instance().set(&DataKey::AccumulatedFee, &0i128);
    }

    /// Registers (or rotates) a creator's encryption public key.
    ///
    /// First call for a given `recipient`: charges the one-time premium
    /// fee (transferred from `recipient` to this contract, accrued for
    /// later batch withdrawal via withdraw_fees()) and marks them premium
    /// forever.
    ///
    /// Subsequent calls (e.g. rotating to a new key after setting up a new
    /// device via recovery phrase): free -- premium status, once paid for,
    /// is not re-charged for key rotation.
    pub fn register_encryption_pubkey(env: Env, recipient: Address, pubkey: BytesN<32>) {
        recipient.require_auth();

        let already_premium: bool = env
            .storage()
            .persistent()
            .get(&DataKey::PremiumActivated(recipient.clone()))
            .unwrap_or(false);

        if !already_premium {
            let fee: i128 = env
                .storage()
                .instance()
                .get(&DataKey::PremiumFee)
                .unwrap_or(DEFAULT_PREMIUM_FEE);
            let token_addr: Address = env
                .storage()
                .instance()
                .get(&DataKey::Token)
                .expect("token not set");
            let token_client = token::Client::new(&env, &token_addr);
            token_client.transfer(&recipient, &env.current_contract_address(), &fee);

            let accumulated: i128 = env
                .storage()
                .instance()
                .get(&DataKey::AccumulatedFee)
                .unwrap_or(0i128);
            env.storage()
                .instance()
                .set(&DataKey::AccumulatedFee, &(accumulated + fee));

            env.storage()
                .persistent()
                .set(&DataKey::PremiumActivated(recipient.clone()), &true);

            PremiumActivatedEvent { recipient: recipient.clone() }.publish(&env);
        }

        env.storage()
            .persistent()
            .set(&DataKey::EncryptionPubKey(recipient), &pubkey);
    }

    /// Public read of a creator's encryption public key, if registered.
    /// Used by a supporter's browser to encrypt a private note.
    pub fn get_encryption_pubkey(env: Env, recipient: Address) -> Option<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::EncryptionPubKey(recipient))
    }

    /// Public read of a creator's premium status. Gates private-note
    /// delivery on /tip/[id] and dashboard analytics, client-side.
    pub fn is_premium(env: Env, recipient: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::PremiumActivated(recipient))
            .unwrap_or(false)
    }

    /// Admin-gated batch withdrawal of accumulated premium fees to the
    /// treasury. Unlike growthip-pool's withdraw_fees(), there is no
    /// privacy reason to delay this -- premium activation already reveals
    /// the creator's identity via their own signed transaction. Kept as a
    /// batch-withdraw pattern anyway for consistency with the rest of the
    /// codebase and to keep per-activation gas cost minimal (no extra
    /// transfer to treasury on every single activation).
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

    /// Public read of pending (not yet withdrawn) accumulated fees.
    pub fn accumulated_fees(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::AccumulatedFee)
            .unwrap_or(0i128)
    }

    /// Admin-gated: adjust the premium activation fee post-deploy, without
    /// a full contract redeploy.
    pub fn update_premium_fee(env: Env, admin: Address, new_fee: i128) {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("admin not set");
        if admin != stored_admin {
            panic!("unauthorized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::PremiumFee, &new_fee);
    }

    /// Public read of the current premium activation fee.
    pub fn premium_fee(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::PremiumFee)
            .unwrap_or(DEFAULT_PREMIUM_FEE)
    }
}

#[cfg(test)]
mod test {
    extern crate std;
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::token;

    fn setup(env: &Env) -> (
        GrowthipCreatorRegistryClient<'static>,
        Address, // admin
        Address, // treasury
        token::Client<'static>,
        token::StellarAssetClient<'static>,
    ) {
        env.mock_all_auths();
        let contract_id = env.register(GrowthipCreatorRegistry, ());
        let client = GrowthipCreatorRegistryClient::new(env, &contract_id);

        let admin = Address::generate(env);
        let treasury = Address::generate(env);
        let token_admin = Address::generate(env);
        let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = sac.address();
        let token_client = token::Client::new(env, &token_addr);
        let token_admin_client = token::StellarAssetClient::new(env, &token_addr);

        client.initialize(&admin, &token_addr, &treasury);

        (client, admin, treasury, token_client, token_admin_client)
    }

    #[test]
    fn first_registration_charges_fee_and_activates_premium() {
        let env = Env::default();
        let (client, _admin, _treasury, token_client, token_admin_client) = setup(&env);

        let creator = Address::generate(&env);
        token_admin_client.mint(&creator, &DEFAULT_PREMIUM_FEE);

        assert_eq!(client.is_premium(&creator), false);
        assert_eq!(client.get_encryption_pubkey(&creator), None);

        let mut pk = [0u8; 32];
        pk[0] = 1;
        let pubkey = BytesN::from_array(&env, &pk);

        client.register_encryption_pubkey(&creator, &pubkey);

        assert_eq!(client.is_premium(&creator), true);
        assert_eq!(client.get_encryption_pubkey(&creator), Some(pubkey));
        assert_eq!(token_client.balance(&creator), 0);
        assert_eq!(client.accumulated_fees(), DEFAULT_PREMIUM_FEE);
    }

    #[test]
    fn key_rotation_after_premium_does_not_recharge() {
        let env = Env::default();
        let (client, _admin, _treasury, token_client, token_admin_client) = setup(&env);

        let creator = Address::generate(&env);
        // Mint exactly one fee's worth -- if rotation incorrectly charged
        // again, the second call would panic on insufficient balance.
        token_admin_client.mint(&creator, &DEFAULT_PREMIUM_FEE);

        let mut pk1 = [0u8; 32];
        pk1[0] = 1;
        client.register_encryption_pubkey(&creator, &BytesN::from_array(&env, &pk1));

        let mut pk2 = [0u8; 32];
        pk2[0] = 2;
        client.register_encryption_pubkey(&creator, &BytesN::from_array(&env, &pk2));

        assert_eq!(token_client.balance(&creator), 0); // only charged once
        assert_eq!(client.accumulated_fees(), DEFAULT_PREMIUM_FEE); // only accrued once
        assert_eq!(
            client.get_encryption_pubkey(&creator),
            Some(BytesN::from_array(&env, &pk2))
        ); // key was updated to the new one
    }

    #[test]
    fn withdraw_fees_sends_accumulated_amount_to_treasury() {
        let env = Env::default();
        let (client, admin, treasury, token_client, token_admin_client) = setup(&env);

        let creator = Address::generate(&env);
        token_admin_client.mint(&creator, &DEFAULT_PREMIUM_FEE);

        let mut pk = [0u8; 32];
        pk[0] = 1;
        client.register_encryption_pubkey(&creator, &BytesN::from_array(&env, &pk));

        let withdrawn = client.withdraw_fees(&admin);
        assert_eq!(withdrawn, DEFAULT_PREMIUM_FEE);
        assert_eq!(client.accumulated_fees(), 0);
        assert_eq!(token_client.balance(&treasury), DEFAULT_PREMIUM_FEE);
    }

    #[test]
    #[should_panic(expected = "unauthorized")]
    fn withdraw_fees_rejects_non_admin() {
        let env = Env::default();
        let (client, _admin, _treasury, _token_client, _token_admin_client) = setup(&env);
        let not_admin = Address::generate(&env);
        client.withdraw_fees(&not_admin);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn initialize_twice_panics() {
        let env = Env::default();
        let (client, admin, treasury, _tc, _tac) = setup(&env);
        let token_addr: Address = env.register_stellar_asset_contract_v2(admin.clone()).address();
        client.initialize(&admin, &token_addr, &treasury);
    }

    #[test]
    fn update_premium_fee_changes_future_charges() {
        let env = Env::default();
        let (client, admin, _treasury, token_client, token_admin_client) = setup(&env);

        let new_fee = 30_000_000i128; // 3 XLM
        client.update_premium_fee(&admin, &new_fee);
        assert_eq!(client.premium_fee(), new_fee);

        let creator = Address::generate(&env);
        token_admin_client.mint(&creator, &new_fee);

        let mut pk = [0u8; 32];
        pk[0] = 1;
        client.register_encryption_pubkey(&creator, &BytesN::from_array(&env, &pk));

        assert_eq!(token_client.balance(&creator), 0);
        assert_eq!(client.accumulated_fees(), new_fee);
    }
}