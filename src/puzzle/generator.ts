import { applyMove, canonicalState, createSolvedState, isSolved, listLegalMoves, validateState } from './rules';
import { solvePuzzle, type SolveResult } from './solver';
import type { BlockSpec, LevelData, PuzzleState } from './types';

export interface DifficultyBand {
  minOptimal: number;
  maxOptimal: number;
  reverseMoves: number;
  attempts: number;
  maxVisited: number;
  tier: string;
}

interface Candidate {
  state: PuzzleState;
  solution: SolveResult;
  distance: number;
  diversityScore: number;
  recentPenalty: number;
  seed: string;
}

export function difficultyBandForLevel(level: number): DifficultyBand {
  const safeLevel = Math.max(1, Math.floor(level));

  if (safeLevel > 45) {
    const maxTierPressure = Math.min(18, Math.floor((safeLevel - 45) / 5));
    return {
      minOptimal: 36,
      maxOptimal: 56,
      reverseMoves: 150 + maxTierPressure * 5,
      attempts: 90,
      maxVisited: 180_000,
      tier: 'master',
    };
  }

  const minOptimal = Math.max(2, Math.floor(2 + Math.pow(safeLevel, 0.88) * 1.15));
  const maxOptimal = minOptimal + Math.min(12, 5 + Math.floor(safeLevel / 5));

  return {
    minOptimal,
    maxOptimal,
    reverseMoves: Math.max(8, maxOptimal * 3 + safeLevel),
    attempts: 72,
    maxVisited: 150_000,
    tier: safeLevel < 8 ? 'apprentice' : safeLevel < 20 ? 'adept' : safeLevel < 35 ? 'expert' : 'master',
  };
}

export function generateLevel(level: number, recentHashes: string[] = []): LevelData {
  const band = difficultyBandForLevel(level);
  const blockedHashes = new Set(recentHashes);
  const baseSeed = `klotski-v1:${level}`;
  let best: Candidate | undefined;

  for (let attempt = 0; attempt < band.attempts; attempt += 1) {
    const seed = `${baseSeed}:${attempt}`;
    const rng = mulberry32(hashString(seed));
    const solvedState = createSeededSolvedState(rng);
    const state = reverseWalk(solvedState, band.reverseMoves + randomInt(rng, 0, band.maxOptimal * 3), rng);
    const stateHash = canonicalState(state);

    if (!validateState(state) || isSolved(state) || blockedHashes.has(stateHash)) {
      continue;
    }

    const solution = solvePuzzle(state, { maxVisited: band.maxVisited, maxDepth: band.maxOptimal + 12 });
    if (!solution.solved) {
      continue;
    }

    const distance = distanceFromBand(solution.optimalMoves, band.minOptimal, band.maxOptimal);
    const candidate: Candidate = {
      state,
      solution,
      distance,
      diversityScore: layoutDiversityScore(state, level),
      recentPenalty: recentSimilarityPenalty(stateHash, recentHashes),
      seed,
    };

    if (!best || candidate.distance < best.distance || isBetterTieBreak(candidate, best)) {
      best = candidate;
    }
  }

  if (best) {
    return buildLevel(level, best, band);
  }

  return buildFallbackLevel(level, band);
}

function buildLevel(level: number, candidate: Candidate, band: DifficultyBand): LevelData {
  const parPressure = Math.max(0, level - 45);
  const par = Math.max(candidate.solution.optimalMoves, candidate.solution.optimalMoves + 4 - Math.floor(parPressure / 6));

  return {
    state: candidate.state,
    meta: {
      level,
      seed: candidate.seed,
      optimalMoves: candidate.solution.optimalMoves,
      par,
      difficultyScore: candidate.solution.difficultyScore,
      branchingFactor: candidate.solution.branchingFactor,
      blockerMoves: candidate.solution.blockerMoves,
      stateHash: canonicalState(candidate.state),
      tier: band.tier,
    },
  };
}

function buildFallbackLevel(level: number, band: DifficultyBand): LevelData {
  const rng = mulberry32(hashString(`fallback:${level}`));
  const state = reverseWalk(createSeededSolvedState(rng), Math.max(4, band.minOptimal), rng);
  const solution = solvePuzzle(state, { maxVisited: band.maxVisited });
  return buildLevel(
    level,
    {
      state,
      solution,
      distance: 0,
      diversityScore: layoutDiversityScore(state, level),
      recentPenalty: 0,
      seed: `fallback:${level}`,
    },
    band,
  );
}

function createSeededSolvedState(rng: () => number): PuzzleState {
  const solved = createSolvedState();
  const hero = solved.blocks.find((block) => block.id === solved.heroId);
  if (!hero) {
    return solved;
  }

  const templates = shuffle(
    solved.blocks.filter((block) => block.id !== solved.heroId).map((block) => ({ ...block })),
    rng,
  ).sort((a, b) => b.w * b.h - a.w * a.h);
  const occupied = new Set<string>();
  markBlock(occupied, hero);

  const packed = packSolvedBlocks(templates, occupied, solved.width, solved.height, rng);
  if (!packed) {
    return solved;
  }

  return {
    width: solved.width,
    height: solved.height,
    heroId: solved.heroId,
    blocks: [{ ...hero }, ...packed],
  };
}

function packSolvedBlocks(
  blocks: BlockSpec[],
  occupied: Set<string>,
  width: number,
  height: number,
  rng: () => number,
): BlockSpec[] | undefined {
  const [block, ...remaining] = blocks;

  if (!block) {
    return [];
  }

  const positions = shuffle(possiblePositions(block, occupied, width, height), rng);
  for (const position of positions) {
    const placed = { ...block, x: position.x, y: position.y };
    const nextOccupied = new Set(occupied);
    markBlock(nextOccupied, placed);

    const packedRest = packSolvedBlocks(remaining, nextOccupied, width, height, rng);
    if (packedRest) {
      return [placed, ...packedRest];
    }
  }

  return undefined;
}

function possiblePositions(
  block: BlockSpec,
  occupied: Set<string>,
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  for (let y = 0; y <= height - block.h; y += 1) {
    for (let x = 0; x <= width - block.w; x += 1) {
      const placed = { ...block, x, y };
      if (blockCellsOpen(placed, occupied)) {
        positions.push({ x, y });
      }
    }
  }

  return positions;
}

function blockCellsOpen(block: BlockSpec, occupied: Set<string>): boolean {
  for (let y = 0; y < block.h; y += 1) {
    for (let x = 0; x < block.w; x += 1) {
      if (occupied.has(`${block.x + x},${block.y + y}`)) {
        return false;
      }
    }
  }

  return true;
}

function markBlock(occupied: Set<string>, block: BlockSpec): void {
  for (let y = 0; y < block.h; y += 1) {
    for (let x = 0; x < block.w; x += 1) {
      occupied.add(`${block.x + x},${block.y + y}`);
    }
  }
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(rng, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function reverseWalk(start: PuzzleState, steps: number, rng: () => number): PuzzleState {
  let state = start;
  let previousHash = '';
  const seen = new Set<string>([canonicalState(start)]);

  for (let step = 0; step < steps; step += 1) {
    const moves = listLegalMoves(state);
    const candidates = moves
      .map((move) => ({ move, state: applyMove(state, move) }))
      .filter((candidate) => canonicalState(candidate.state) !== previousHash);
    const pool = candidates.length > 0 ? candidates : moves.map((move) => ({ move, state: applyMove(state, move) }));
    const weightedPool = pool.flatMap((candidate) => {
      const hash = canonicalState(candidate.state);
      const noveltyWeight = seen.has(hash) ? 1 : 4;
      const blockerWeight = candidate.move.blockId === state.heroId ? 2 : 3;
      const weight = noveltyWeight + blockerWeight;
      return Array.from({ length: weight }, () => candidate);
    });
    const picked = weightedPool[randomInt(rng, 0, weightedPool.length - 1)];

    previousHash = canonicalState(state);
    state = picked.state;
    seen.add(canonicalState(state));
  }

  return state;
}

function distanceFromBand(value: number, min: number, max: number): number {
  if (value < min) {
    return min - value;
  }

  if (value > max) {
    return value - max;
  }

  return 0;
}

function isBetterTieBreak(next: Candidate, current: Candidate): boolean {
  const nextRank = candidateRank(next);
  const currentRank = candidateRank(current);

  if (nextRank !== currentRank) {
    return nextRank > currentRank;
  }

  if (next.solution.difficultyScore !== current.solution.difficultyScore) {
    return next.solution.difficultyScore > current.solution.difficultyScore;
  }

  return next.seed < current.seed;
}

function candidateRank(candidate: Candidate): number {
  const inBandBonus = candidate.distance === 0 ? 10_000 : 0;
  return inBandBonus - candidate.distance * 1_000 + candidate.diversityScore - candidate.recentPenalty;
}

function layoutDiversityScore(state: PuzzleState, level: number): number {
  const solvedPositions = new Map(createSolvedState().blocks.map((block) => [block.id, block]));
  const targetColumn = level % 2 === 0 ? 0 : state.width - 1;
  let displacement = 0;
  let edgeMix = 0;
  let targetColumnPressure = 0;
  let heroPressure = 0;

  for (const block of state.blocks) {
    const solved = solvedPositions.get(block.id);
    if (solved) {
      displacement += Math.abs(block.x - solved.x) + Math.abs(block.y - solved.y);
    }

    const centerX = block.x + block.w / 2;
    const centerY = block.y + block.h / 2;
    if (centerX <= 1 || centerX >= state.width - 1) {
      edgeMix += 2;
    }
    if (centerY <= 1 || centerY >= state.height - 1) {
      edgeMix += 1;
    }
    if (Math.abs(centerX - targetColumn) < 1.25) {
      targetColumnPressure += block.type === 'hero' ? 0 : 2;
    }
    if (block.id === state.heroId) {
      heroPressure = (Math.abs(block.x - 1) + Math.abs(block.y - 3)) * 8;
    }
  }

  return displacement * 7 + edgeMix + targetColumnPressure + heroPressure + emptyCellPatternScore(state, level);
}

function emptyCellPatternScore(state: PuzzleState, level: number): number {
  const occupied = new Set<string>();
  for (const block of state.blocks) {
    for (let y = 0; y < block.h; y += 1) {
      for (let x = 0; x < block.w; x += 1) {
        occupied.add(`${block.x + x},${block.y + y}`);
      }
    }
  }

  let score = 0;
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      if (!occupied.has(`${x},${y}`)) {
        score += Math.abs(x - ((level + y) % state.width)) * 2;
        score += y === 0 || y === state.height - 1 ? 3 : 0;
      }
    }
  }

  return score;
}

function recentSimilarityPenalty(stateHash: string, recentHashes: string[]): number {
  const stateTokens = new Set(stateHash.split(/[|:;]/).filter(Boolean));
  let penalty = 0;

  for (const recentHash of recentHashes.slice(0, 8)) {
    const recentTokens = new Set(recentHash.split(/[|:;]/).filter(Boolean));
    let shared = 0;
    for (const token of stateTokens) {
      if (recentTokens.has(token)) {
        shared += 1;
      }
    }
    penalty += (shared / Math.max(1, stateTokens.size)) * 18;
  }

  return penalty;
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function hashString(input: string): number {
  let hash = 2_166_136_261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}
