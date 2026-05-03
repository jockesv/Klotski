import { findBlock, isSolved, listLegalMoves, applyMove, canonicalState } from './rules';
import { GOAL_X, GOAL_Y, type Move, type PuzzleState } from './types';

export interface SolveOptions {
  maxVisited?: number;
  maxDepth?: number;
}

export interface SolveResult {
  solved: boolean;
  optimalMoves: number;
  visited: number;
  expanded: number;
  branchingFactor: number;
  blockerMoves: number;
  heroDistance: number;
  difficultyScore: number;
}

interface QueueNode {
  state: PuzzleState;
  depth: number;
  blockerMoves: number;
}

export function solvePuzzle(state: PuzzleState, options: SolveOptions = {}): SolveResult {
  const maxVisited = options.maxVisited ?? 140_000;
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const startKey = canonicalState(state);
  const queue: QueueNode[] = [{ state, depth: 0, blockerMoves: 0 }];
  const visited = new Set<string>([startKey]);
  let head = 0;
  let expanded = 0;
  let totalLegalMoves = 0;

  while (head < queue.length) {
    const node = queue[head];
    head += 1;

    if (isSolved(node.state)) {
      return buildResult(true, node.depth, visited.size, expanded, totalLegalMoves, node.blockerMoves, state);
    }

    if (node.depth >= maxDepth) {
      continue;
    }

    const legalMoves = listLegalMoves(node.state);
    expanded += 1;
    totalLegalMoves += legalMoves.length;

    for (const move of legalMoves) {
      const next = applyMove(node.state, move);
      const key = canonicalState(next);

      if (visited.has(key)) {
        continue;
      }

      visited.add(key);

      if (visited.size > maxVisited) {
        return buildResult(false, -1, visited.size, expanded, totalLegalMoves, node.blockerMoves, state);
      }

      queue.push({
        state: next,
        depth: node.depth + 1,
        blockerMoves: node.blockerMoves + (move.blockId === node.state.heroId ? 0 : 1),
      });
    }
  }

  return buildResult(false, -1, visited.size, expanded, totalLegalMoves, 0, state);
}

function buildResult(
  solved: boolean,
  optimalMoves: number,
  visited: number,
  expanded: number,
  totalLegalMoves: number,
  blockerMoves: number,
  state: PuzzleState,
): SolveResult {
  const branchingFactor = expanded > 0 ? totalLegalMoves / expanded : 0;
  const heroDistance = getHeroDistance(state);
  const difficultyScore = solved
    ? Math.round(optimalMoves * 10 + branchingFactor * 5 + blockerMoves * 1.5 + heroDistance * 6)
    : 0;

  return {
    solved,
    optimalMoves,
    visited,
    expanded,
    branchingFactor,
    blockerMoves,
    heroDistance,
    difficultyScore,
  };
}

function getHeroDistance(state: PuzzleState): number {
  const hero = findBlock(state, state.heroId);
  if (!hero) {
    return 0;
  }

  return Math.abs(hero.x - GOAL_X) + Math.abs(hero.y - GOAL_Y);
}

export function moveKey(move: Move): string {
  return `${move.blockId}:${move.dx},${move.dy}`;
}
