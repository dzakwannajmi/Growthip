pragma circom 2.2.2;

// ─────────────────────────────────────────────────────────────────────────────
// Growthip V5 shielded transaction: 2-in/2-out JoinSplit over BN254 (Groth16).
//
// Adapted from fxjrin/cyphras circuits/src/transaction.circom (Apache-2.0),
// which follows the Tornado Nova / Zcash Sapling lineage. Structure, domain
// tags, and gadget choices are kept bit-identical to the audited-by-usage
// upstream so the vendored Poseidon2 parity vectors remain authoritative.
// See circuits/ATTRIBUTION note in contracts/poseidon2/ATTRIBUTION.md.
//
// Domain tags: 0x01 commitment, 0x02 nullifier, 0x05 pk_d fold, 0x06 nk fold,
//              0x07 ak fold, 0x10 ivk, 0x11 r_d.
//
// Public inputs (declared order — MUST match tx::public_inputs in Pool V5):
//   root, publicAmount, extDataHash, domain, inputNullifier[2], outputCommitment[2]
//
// Security invariants enforced here (see test/transaction2x2.test.mjs for the
// executable negative tests of each):
//   I1  ask/nsk are canonical scalars in [0, L)               (AssertLtL)
//   I2  spend authority is algebraic: pk_d = ivk·g_d, with ivk derived from
//       ask/nsk — a leaked note (amount/blinding) alone is NOT spendable
//   I3  nullifier = P2(commitment, pathIndices, nkFold, 0x02) — bound to the
//       owner's nk and the leaf position, checked against the public input
//   I4  Merkle inclusion against the public root for every real input;
//       dummy inputs (amount == 0) skip only the root equality, nothing else
//   I5  amounts range-checked to 248 bits on BOTH input and output side
//   I6  input nullifiers pairwise distinct within one transaction
//   I7  sumIns + publicAmount === sumOuts (field-encoded signed publicAmount)
//   I8  extDataHash and domain are squared so the optimizer cannot drop them;
//       their semantic checks (keccak recompute, per-pool domain value) live
//       on-chain in transact()
//   I9  output recipient points are checked on-curve (BabyCheck); an invalid
//       point only burns the sender's own note (not a soundness boundary)
// ─────────────────────────────────────────────────────────────────────────────

include "poseidon2/poseidon2_hash.circom";
include "merkleProof.circom";
include "keypair.circom";                          // DerivePoint, AssertLtL, ReduceModL
include "circomlib/circuits/babyjub.circom";       // BabyCheck
include "circomlib/circuits/escalarmulany.circom"; // EscalarMulAny (variable base)
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

template Transaction(levels, nIns, nOuts) {
  signal input root;
  signal input publicAmount;      // signed via field encoding: p - |x| for withdrawals
  signal input extDataHash;       // keccak256(XDR(ExtData)) mod p, recomputed on-chain
  signal input domain;            // per-pool tag (XLM V5 != USDC V5), set at init()

  signal input inputNullifier[nIns];
  signal input inAmount[nIns];
  signal input inAsk[nIns];        // spend scalar, canonical in [0,L)   — PRIVATE
  signal input inNsk[nIns];        // nullifier scalar, canonical in [0,L) — PRIVATE
  signal input inD[nIns];          // diversifier (field-encoded)         — PRIVATE
  signal input inBlinding[nIns];
  signal input inPathIndices[nIns];
  signal input inPathElements[nIns][levels];

  signal input outputCommitment[nOuts];
  signal input outAmount[nOuts];
  signal input outPubkeyAx[nOuts]; // recipient pk_d.x
  signal input outPubkeyAy[nOuts]; // recipient pk_d.y
  signal input outBlinding[nOuts];

  component inAskChk[nIns];
  component inNskChk[nIns];
  component inAk[nIns];
  component inNk[nIns];
  component inAkFold[nIns];
  component inNkFold[nIns];
  component inIvkHash[nIns];
  component inIvkRed[nIns];
  component inRdHash[nIns];
  component inRdRed[nIns];
  component inGd[nIns];
  component inIvkBits[nIns];
  component inPkd[nIns];
  component inPkdFold[nIns];
  component inCommitmentHasher[nIns];
  component inNullifierHasher[nIns];
  component inTree[nIns];
  component inCheckRoot[nIns];
  component inAmountCheck[nIns];
  var sumIns = 0;

  for (var tx = 0; tx < nIns; tx++) {
    // I1: canonical scalar checks — non-canonical scalars would alias points
    // and break nullifier determinism.
    inAskChk[tx] = AssertLtL();
    inAskChk[tx].s <== inAsk[tx];
    inNskChk[tx] = AssertLtL();
    inNskChk[tx].s <== inNsk[tx];

    // I2: rebuild the full Sapling-style key chain inside the circuit.
    inAk[tx] = DerivePoint();
    inAk[tx].s <== inAsk[tx];
    inNk[tx] = DerivePoint();
    inNk[tx].s <== inNsk[tx];

    // Fold each point to one field element (avoids a t=5 Poseidon2).
    inAkFold[tx] = Poseidon2(2);
    inAkFold[tx].inputs[0] <== inAk[tx].Px;
    inAkFold[tx].inputs[1] <== inAk[tx].Py;
    inAkFold[tx].domainSeparation <== 0x07;

    inNkFold[tx] = Poseidon2(2);
    inNkFold[tx].inputs[0] <== inNk[tx].Px;
    inNkFold[tx].inputs[1] <== inNk[tx].Py;
    inNkFold[tx].domainSeparation <== 0x06;

    inIvkHash[tx] = Poseidon2(2);
    inIvkHash[tx].inputs[0] <== inAkFold[tx].out;
    inIvkHash[tx].inputs[1] <== inNkFold[tx].out;
    inIvkHash[tx].domainSeparation <== 0x10;
    inIvkRed[tx] = ReduceModL();
    inIvkRed[tx].in <== inIvkHash[tx].out;

    // g_d = r_d·Base8, with r_d derived from the diversifier.
    inRdHash[tx] = Poseidon2(1);
    inRdHash[tx].inputs[0] <== inD[tx];
    inRdHash[tx].domainSeparation <== 0x11;
    inRdRed[tx] = ReduceModL();
    inRdRed[tx].in <== inRdHash[tx].out;
    inGd[tx] = DerivePoint();
    inGd[tx].s <== inRdRed[tx].out;

    // pk_d = ivk·g_d. Off-chain the wallet computes (ivk·r_d mod L)·Base8 —
    // the same point. 253-bit variable-base mult: the expensive part of the
    // circuit, and the reason a leaked note is not spendable without ask/nsk.
    inIvkBits[tx] = Num2Bits(253);
    inIvkBits[tx].in <== inIvkRed[tx].out;
    inPkd[tx] = EscalarMulAny(253);
    for (var i = 0; i < 253; i++) { inPkd[tx].e[i] <== inIvkBits[tx].out[i]; }
    inPkd[tx].p[0] <== inGd[tx].Px;
    inPkd[tx].p[1] <== inGd[tx].Py;

    inPkdFold[tx] = Poseidon2(2);
    inPkdFold[tx].inputs[0] <== inPkd[tx].out[0];
    inPkdFold[tx].inputs[1] <== inPkd[tx].out[1];
    inPkdFold[tx].domainSeparation <== 0x05;

    inCommitmentHasher[tx] = Poseidon2(3);
    inCommitmentHasher[tx].inputs[0] <== inAmount[tx];
    inCommitmentHasher[tx].inputs[1] <== inPkdFold[tx].out;
    inCommitmentHasher[tx].inputs[2] <== inBlinding[tx];
    inCommitmentHasher[tx].domainSeparation <== 0x01;

    // I3: nullifier binds nk + leaf position, and must equal the public input.
    inNullifierHasher[tx] = Poseidon2(3);
    inNullifierHasher[tx].inputs[0] <== inCommitmentHasher[tx].out;
    inNullifierHasher[tx].inputs[1] <== inPathIndices[tx];
    inNullifierHasher[tx].inputs[2] <== inNkFold[tx].out;
    inNullifierHasher[tx].domainSeparation <== 0x02;
    inNullifierHasher[tx].out === inputNullifier[tx];

    // I4: Merkle inclusion. pathIndices bits are boolean-constrained inside
    // MerkleProof via Num2Bits(levels).
    inTree[tx] = MerkleProof(levels);
    inTree[tx].leaf <== inCommitmentHasher[tx].out;
    inTree[tx].pathIndices <== inPathIndices[tx];
    for (var i = 0; i < levels; i++) {
      inTree[tx].pathElements[i] <== inPathElements[tx][i];
    }

    // Dummy inputs (amount == 0) skip ONLY the root equality:
    // (root - computedRoot) * inAmount === 0.
    inCheckRoot[tx] = ForceEqualIfEnabled();
    inCheckRoot[tx].in[0] <== root;
    inCheckRoot[tx].in[1] <== inTree[tx].root;
    inCheckRoot[tx].enabled <== inAmount[tx];

    // I5 (input side): 248-bit range check.
    inAmountCheck[tx] = Num2Bits(248);
    inAmountCheck[tx].in <== inAmount[tx];

    sumIns += inAmount[tx];
  }

  component outBabyCheck[nOuts];
  component outPkdFold[nOuts];
  component outCommitmentHasher[nOuts];
  component outAmountCheck[nOuts];
  var sumOuts = 0;

  for (var tx = 0; tx < nOuts; tx++) {
    // I9: on-curve check for the recipient point (untrusted sender data).
    outBabyCheck[tx] = BabyCheck();
    outBabyCheck[tx].x <== outPubkeyAx[tx];
    outBabyCheck[tx].y <== outPubkeyAy[tx];

    outPkdFold[tx] = Poseidon2(2);
    outPkdFold[tx].inputs[0] <== outPubkeyAx[tx];
    outPkdFold[tx].inputs[1] <== outPubkeyAy[tx];
    outPkdFold[tx].domainSeparation <== 0x05;

    outCommitmentHasher[tx] = Poseidon2(3);
    outCommitmentHasher[tx].inputs[0] <== outAmount[tx];
    outCommitmentHasher[tx].inputs[1] <== outPkdFold[tx].out;
    outCommitmentHasher[tx].inputs[2] <== outBlinding[tx];
    outCommitmentHasher[tx].domainSeparation <== 0x01;
    outCommitmentHasher[tx].out === outputCommitment[tx];

    // I5 (output side): the classic shielded-pool bug #1 — without this an
    // attacker mints funds via output overflow. NEVER remove.
    outAmountCheck[tx] = Num2Bits(248);
    outAmountCheck[tx].in <== outAmount[tx];

    sumOuts += outAmount[tx];
  }

  // I6: input nullifiers must be pairwise distinct.
  component sameNullifiers[nIns * (nIns - 1) / 2];
  var index = 0;
  for (var i = 0; i < nIns - 1; i++) {
    for (var j = i + 1; j < nIns; j++) {
      sameNullifiers[index] = IsEqual();
      sameNullifiers[index].in[0] <== inputNullifier[i];
      sameNullifiers[index].in[1] <== inputNullifier[j];
      sameNullifiers[index].out === 0;
      index++;
    }
  }

  // I7: value conservation with field-encoded signed publicAmount.
  sumIns + publicAmount === sumOuts;

  // I8: bind extDataHash + domain into the witness (anti-malleability); their
  // values are validated on-chain.
  signal extDataSquare <== extDataHash * extDataHash;
  signal domainSquare <== domain * domain;
}

component main {public [root, publicAmount, extDataHash, domain, inputNullifier, outputCommitment]}
  = Transaction(20, 2, 2);
