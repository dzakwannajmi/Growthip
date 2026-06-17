// Growthip V3 demo proof artifacts
// Contract IDs are read from environment variables via config.ts.
// To update contract addresses, change .env.local or Vercel env vars.
import { config } from "./config";
// Generated from: circuits/growthip_merkle_note_v3.circom
// commitment = Poseidon(secret, nullifier, recipientHash)
// recipientHash is now cryptographically bound inside commitment

export const GROWTHIP_PROOF_HEX =
  "18b6f2c3e68ba5176be9858b3ff7656c3ea954c4618cfde22e0cb4b6f58a01591cb2327577005124563905e4926f39fe0cea948db0a6344f84c75e09bedf2fdb1e7b40c10e213aaec99e2f5900c6c4b689ab374b7d8a4e0fd496c8959792b22c236f62331f7f1196386bb600bb5d2497d02052e9316576ee5fbc24649f9f3f6502d5de86ed1d7566e0f84fc89453d6c82fd663b4a1ad22652e0d3c5d5595fb4413003abc74c80d87720a6dc0ba38390b8bedb0f7d1eb89dfc2e88134e38ddf1b10b52f023c2896ed02d70794b5bcfa1cd4abf57073712f1d956618386181d151075cd771b9532fc5ac6acf1f308c840a821030ae96e276441ccc490e6943b4b5";

// Public inputs order: [root, nullifierHash, recipientHash]
export const GROWTHIP_PUBLIC_INPUTS_HEX = [
  "08daffaefc12dee54e8d252685e4e44349dc4d9e9c54c8ecf0e8696622b78fe9", // root
  "0dac097e298e979aabb191103632235b50509d554a7cf069b26ed1a8d19e4c4e", // nullifierHash
  "2c0acd40895e84be979b1b7e0791a11d24373bd470114c2f959639b49490abed", // recipientHash
];

export const GROWTHIP_COMMITMENT_HEX =
  "04a6f832b1ef0f25bc6e43fdff66ad156d0d0ebae74daaf9b9446aec58103fd8";

export const GROWTHIP_ROOT_HEX          = GROWTHIP_PUBLIC_INPUTS_HEX[0];
export const GROWTHIP_NULLIFIER_HASH_HEX = GROWTHIP_PUBLIC_INPUTS_HEX[1];
export const GROWTHIP_RECIPIENT_HASH_HEX = GROWTHIP_PUBLIC_INPUTS_HEX[2];

export const GROWTHIP_DEMO_NOTE = {
  version: "growthip-merkle-note-v3",
  secret:
    "447296737921650598913016789213985444497565642252320626909945452072671772248",
  nullifier:
    "136330292170269627101563123452329663537015910595370219212614445421491215076",
  recipientId:
    "placeholder-derived-from-recipient-address",
  commitment:
    "2104261006916233633133697712062370603646600964282193677044123011294579146712",
  nullifierHash:
    "6184030243771209318320255426002569622359189708558782005926667266829903088718",
  recipientHash:
    "19920850406215850322817387400183383836610063141723435644915896005675763936237",
  root:
    "4005440111683431019425425097544545895963301757513186792447013004709901864937",
  leafIndex: 0,
  warning:
    "V3 demo note. recipientHash is cryptographically bound inside commitment.",
};

// Pool and verifier contract addresses (V3 testnet deployment)
// Read from environment variables — never hardcode these
export const GROWTHIP_POOL_ID       = config.pool.id;
export const GROWTHIP_VERIFIER_V3_ID = config.verifier.v3Id;
export const GROWTHIP_TOKEN_ID       = config.token.id;
