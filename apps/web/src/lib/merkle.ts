/**
 * merkle.ts
 *
 * Browser-side Merkle tree reconstruction for Growthip V3.
 *
 * The tree is a fixed depth-3 binary tree (max 8 leaves).
 * Hashing matches the V3 circuit exactly:
 *   - Internal node = Poseidon(left, right)   (hash2)
 *   - Empty leaf    = "0" (string literal field element)
 *   - left/right are ordered by tree position (NOT by value):
 *       a node at an even index is the LEFT child  -> pathIndex = 0
 *       a node at an odd  index is the RIGHT child -> pathIndex = 1
 *
 * This mirrors `scripts/make_growthip_merkle_input_v3.js`, which builds the
 * tree bottom-up and pads missing leaves with "0".
 *
 * All field elements are decimal strings. Commitments read from the Soroban
 * contract are 32-byte big-endian values (hex); use `hexToDecimal` to convert.
 */

import { hash2 } from "./poseidon";

/** Fixed tree depth for Growthip V4. */
export const TREE_DEPTH = 20;

/** Maximum number of leaves (2 ** TREE_DEPTH). */
export const MAX_LEAVES = 1 << TREE_DEPTH; // 1,048,576

/** Empty-leaf value used as padding (string literal, matching the circuit). */
export const EMPTY_LEAF = "0";

export interface MerkleTree {
  /** Root as a decimal string. */
  root: string;
  /**
   * All layers bottom-up. layers[0] = leaves (length 8),
   * layers[1] = 4 nodes, layers[2] = 2 nodes, layers[3] = [root].
   */
  layers: string[][];
  /** The padded leaves (length MAX_LEAVES), decimal strings. */
  leaves: string[];
}

export interface MerklePath {
  /** Sibling values bottom-up, length TREE_DEPTH, decimal strings. */
  pathElements: string[];
  /** Direction bits bottom-up, length TREE_DEPTH ("0" = our node is left). */
  pathIndices: string[];
}

/**
 * Convert a 32-byte big-endian hex string (with or without "0x") to a
 * decimal field-element string. Used for commitments read from the contract.
 */
export function hexToDecimal(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length === 0) return "0";
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`Invalid hex string: ${hex}`);
  }
  return BigInt("0x" + clean).toString();
}

/**
 * Convert a Uint8Array (e.g. BytesN<32> from the contract) to a decimal
 * field-element string, interpreting bytes as big-endian.
 */
export function bytesToDecimal(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hexToDecimal(hex);
}

/**
 * Build a depth-3 Merkle tree from the given commitments (decimal strings).
 *
 * @param commitments Up to 8 commitments as decimal strings, in deposit order.
 * @throws if more than MAX_LEAVES commitments are provided.
 */
export async function buildMerkleTree(
  commitments: string[],
): Promise<MerkleTree> {
  if (commitments.length > MAX_LEAVES) {
    throw new Error(
      `Pool is full: ${commitments.length} commitments exceeds max ${MAX_LEAVES}.`,
    );
  }

  // Pad to exactly MAX_LEAVES with EMPTY_LEAF.
  const leaves: string[] = [...commitments];
  while (leaves.length < MAX_LEAVES) leaves.push(EMPTY_LEAF);

  const layers: string[][] = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(await hash2(current[i], current[i + 1]));
    }
    layers.push(next);
    current = next;
  }

  return { root: layers[layers.length - 1][0], layers, leaves };
}

/**
 * Compute the Merkle path for the leaf at `leafIndex`.
 *
 * At each level the sibling is the adjacent node; the direction bit encodes
 * whether OUR node sits on the left ("0") or the right ("1") — matching the
 * circuit's mux:
 *   left  = current + idx * (pathElement - current)
 *   right = pathElement + idx * (current - pathElement)
 */
export function getMerklePathByIndex(
  tree: MerkleTree,
  leafIndex: number,
): MerklePath {
  if (leafIndex < 0 || leafIndex >= MAX_LEAVES) {
    throw new Error(`leafIndex out of range: ${leafIndex}`);
  }

  const pathElements: string[] = [];
  const pathIndices: string[] = [];

  let index = leafIndex;
  for (let level = 0; level < TREE_DEPTH; level++) {
    const isRightNode = index % 2 === 1;
    const siblingIndex = isRightNode ? index - 1 : index + 1;
    pathElements.push(tree.layers[level][siblingIndex]);
    // pathIndex describes OUR position: 0 if our node is the left child.
    pathIndices.push(isRightNode ? "1" : "0");
    index = Math.floor(index / 2);
  }

  return { pathElements, pathIndices };
}

/**
 * Find a commitment among all commitments and return its Merkle path.
 *
 * @param commitment   The leaf to locate (decimal string).
 * @param allCommitments Ordered commitments read from the contract (decimal).
 * @returns The Merkle path plus the resolved leaf index.
 * @throws if the commitment is not present in the pool.
 */
export async function getMerklePath(
  commitment: string,
  allCommitments: string[],
): Promise<MerklePath & { leafIndex: number }> {
  const leafIndex = allCommitments.indexOf(commitment);
  if (leafIndex === -1) {
    throw new Error(
      "Commitment not found in the on-chain pool. The note may belong to a " +
        "different pool, or the deposit has not been confirmed yet.",
    );
  }
  const tree = await buildMerkleTree(allCommitments);
  const path = getMerklePathByIndex(tree, leafIndex);
  return { ...path, leafIndex };
}