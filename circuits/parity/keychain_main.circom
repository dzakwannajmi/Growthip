pragma circom 2.2.2;

// Parity harness: the FULL key chain as the transaction circuit computes it.
// Inputs ask, nsk (canonical scalars) and d (field-encoded diversifier);
// outputs every intermediate so the TS module can be checked bit-for-bit.
// Uses the vendored keypair.circom gadgets (DerivePoint, ReduceModL, AssertLtL)
// and Poseidon2 templates — the same code the real circuit includes.

include "../lib/poseidon2/poseidon2_hash.circom";
include "../lib/keypair.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/escalarmulany.circom";

template KeychainParity() {
    signal input ask;
    signal input nsk;
    signal input d;

    signal output akX;
    signal output akY;
    signal output nkX;
    signal output nkY;
    signal output akFold;
    signal output nkFold;
    signal output ivk;   // reduced mod L
    signal output rd;    // reduced mod L
    signal output pkdX;
    signal output pkdY;

    component askChk = AssertLtL();
    askChk.s <== ask;
    component nskChk = AssertLtL();
    nskChk.s <== nsk;

    component ak = DerivePoint();
    ak.s <== ask;
    component nk = DerivePoint();
    nk.s <== nsk;
    akX <== ak.Px;
    akY <== ak.Py;
    nkX <== nk.Px;
    nkY <== nk.Py;

    component akF = Poseidon2(2);
    akF.inputs[0] <== ak.Px;
    akF.inputs[1] <== ak.Py;
    akF.domainSeparation <== 0x07;
    akFold <== akF.out;

    component nkF = Poseidon2(2);
    nkF.inputs[0] <== nk.Px;
    nkF.inputs[1] <== nk.Py;
    nkF.domainSeparation <== 0x06;
    nkFold <== nkF.out;

    component ivkH = Poseidon2(2);
    ivkH.inputs[0] <== akF.out;
    ivkH.inputs[1] <== nkF.out;
    ivkH.domainSeparation <== 0x10;
    component ivkR = ReduceModL();
    ivkR.in <== ivkH.out;
    ivk <== ivkR.out;

    component rdH = Poseidon2(1);
    rdH.inputs[0] <== d;
    rdH.domainSeparation <== 0x11;
    component rdR = ReduceModL();
    rdR.in <== rdH.out;
    rd <== rdR.out;

    component gd = DerivePoint();
    gd.s <== rdR.out;

    component ivkBits = Num2Bits(253);
    ivkBits.in <== ivkR.out;
    component pkd = EscalarMulAny(253);
    for (var i = 0; i < 253; i++) { pkd.e[i] <== ivkBits.out[i]; }
    pkd.p[0] <== gd.Px;
    pkd.p[1] <== gd.Py;
    pkdX <== pkd.out[0];
    pkdY <== pkd.out[1];
}

component main = KeychainParity();
