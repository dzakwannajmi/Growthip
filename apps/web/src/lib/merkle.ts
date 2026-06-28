/**
 * merkle.ts
 *
 * Browser-side sparse incremental Merkle tree for Growthip V4.
 *
 * Upgraded from fixed depth-3 (rebuild all 8 leaves) to sparse depth-20:
 * only hashes nodes that have at least one real (non-empty) leaf descendant.
 * All other nodes use precomputed empty subtree roots.
 *
 * Complexity: O(N x TREE_DEPTH) where N = number of deposits.
 * This replaces the old O(2^DEPTH) approach which would freeze at depth-20.
 *
 * Matches the on-chain incremental tree (merkle_onchain.rs) exactly:
 *   - Internal node = Poseidon(left, right) via hash2
 *   - Empty leaf    = "0" (field element 0)
 *   - empty_nodes[i] = hash2(empty_nodes[i-1], empty_nodes[i-1])
 */

import { hash2 } from "./poseidon";

/** Tree depth for Growthip V4. */
export const TREE_DEPTH = 20;

/** Maximum number of leaves (2 ** TREE_DEPTH). */
export const MAX_LEAVES = 1 << TREE_DEPTH; // 1,048,576

/** Empty-leaf value used as padding (matching the circuit). */
export const EMPTY_LEAF = "0";

export interface MerklePath {
  /** Sibling values bottom-up, length TREE_DEPTH, decimal strings. */
  pathElements: string[];
  /** Direction bits bottom-up, length TREE_DEPTH ("0" = our node is left). */
  pathIndices: string[];
}

/** Precomputed empty subtree roots — lazy-initialized singleton. */
let _emptyNodes: string[] | null = null;

async function getEmptyNodes(): Promise<string[]> {
  if (_emptyNodes) return _emptyNodes;
  const nodes: string[] = [EMPTY_LEAF];
  for (let i = 1; i <= TREE_DEPTH; i++) {
    nodes.push(await hash2(nodes[i - 1], nodes[i - 1]));
  }
  _emptyNodes = nodes;
  return nodes;
}

/**
 * Convert a 32-byte big-endian hex string to a decimal field-element string.
 */
export function hexToDecimal(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length === 0) return "0";
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error(`Invalid hex string: ${hex}`);
  return BigInt("0x" + clean).toString();
}

/**
 * Convert a Uint8Array (BytesN<32> from contract) to a decimal field-element string.
 */
export function bytesToDecimal(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hexToDecimal(hex);
}

/**
 * Find a commitment and compute its Merkle path using a sparse tree.
 *
 * Only hashes nodes with at least one real descendant — O(N x TREE_DEPTH).
 * Siblings with no real descendants use precomputed empty subtree roots.
 *
 * @param commitment    The leaf to locate (decimal string).
 * @param allCommitments All deposits in order (decimal strings).
 * @returns Merkle path + leafIndex + computed root.
 */
export async function getMerklePath(
  commitment: string,
  allCommitments: string[],
): Promise<MerklePath & { leafIndex: number; root: string }> {
  const leafIndex = allCommitments.indexOf(commitment);
  if (leafIndex === -1) {
    throw new Error(
      "Commitment not found in the on-chain pool. The note may belong to a " +
        "different pool, or the deposit has not been confirmed yet.",
    );
  }

  const emptyNodes = await getEmptyNodes();

  // Build sparse tree using Maps (index -> value) per level.
  // Only real nodes are stored; missing nodes fall back to emptyNodes[level].
  let currentLayer = new Map<number, string>();
  for (let i = 0; i < allCommitments.length; i++) {
    currentLayer.set(i, allCommitments[i]);
  }

  const pathElements: string[] = [];
  const pathIndices: string[] = [];
  let idx = leafIndex;

  for (let level = 0; level < TREE_DEPTH; level++) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;

    // Sibling: stored value or precomputed empty subtree root
    const sibling = currentLayer.get(siblingIdx) ?? emptyNodes[level];
    pathElements.push(sibling);
    pathIndices.push(isRight ? "1" : "0");

    // Build next layer: only process parents that have at least one real child
    const nextLayer = new Map<number, string>();
    const processedParents = new Set<number>();

    for (const [nodeIdx] of currentLayer) {
      const parentIdx = Math.floor(nodeIdx / 2);
      if (processedParents.has(parentIdx)) continue;
      processedParents.add(parentIdx);

      const leftIdx = parentIdx * 2;
      const rightIdx = leftIdx + 1;
      const left  = currentLayer.get(leftIdx)  ?? emptyNodes[level];
      const right = currentLayer.get(rightIdx) ?? emptyNodes[level];
      nextLayer.set(parentIdx, await hash2(left, right));
    }

    currentLayer = nextLayer;
    idx = Math.floor(idx / 2);
  }

  const root = currentLayer.get(0) ?? emptyNodes[TREE_DEPTH];
  console.log("[merkle] computed root:", BigInt(root).toString(16).padStart(64, "0"));
  console.log("[merkle] leafIndex:", leafIndex, "commitments:", allCommitments.length);
  return { pathElements, pathIndices, leafIndex, root };
}

/**
 * Legacy export for backward compatibility.
 * @deprecated Use getMerklePath directly — buildMerkleTree is O(2^DEPTH) and unusable at depth-20.
 */
export async function buildMerkleTree(commitments: string[]): Promise<{ root: string; layers: string[][]; leaves: string[] }> {
  throw new Error(
    "buildMerkleTree() is not supported at depth-20 (would hash 1M+ leaves). " +
    "Use getMerklePath() directly instead."
  );
}

export function getMerklePathByIndex(
  tree: { layers: string[][] },
  leafIndex: number,
): MerklePath {
  throw new Error(
    "getMerklePathByIndex() requires a full tree — not supported at depth-20. " +
    "Use getMerklePath() directly instead."
  );
}
