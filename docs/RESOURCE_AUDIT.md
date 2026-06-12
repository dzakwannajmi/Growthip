# Resource Audit — Growthip

## Reference Repos
- NethermindEth/stellar-risc0-verifier: pending inspection

## Questions to Answer
1. Is there a generic Groth16 verifier?
2. Does it accept Circom/snarkjs proofs?
3. What proof byte format is expected?
4. What public input format is expected?
5. What verifying key format is expected?
6. Can it compile locally?
7. Can a dummy proof be verified?

## Native BN254 Dummy Proof Result

The dummy Circom/snarkjs proof was successfully verified by a Soroban-style native BN254 verifier.

Artifacts:
- circuits/square.circom
- circuits/build/proof.json
- circuits/build/public.json
- circuits/build/verification_key.json
- circuits/build/proof_abc.hex
- circuits/build/square_parameters.json
- contracts/square-verifier

Conclusion:
Native Groth16 BN254 verification is feasible for Growthip.
Next step is to build a Growthip-specific circuit.
