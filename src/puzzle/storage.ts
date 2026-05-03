import type { LevelMeta } from './types';

const STORAGE_KEY = 'klotski-progress-v1';
const RECENT_LIMIT = 40;

export interface LevelBest {
  moves: number;
  stars: number;
  optimalMoves: number;
  seed: string;
}

export interface StoredProgress {
  currentLevel: number;
  unlockedLevel: number;
  bestByLevel: Record<string, LevelBest>;
  recentHashes: string[];
}

export function loadProgress(): StoredProgress {
  if (!globalThis.localStorage) {
    return createDefaultProgress();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultProgress();
    }

    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    return {
      currentLevel: Math.max(1, parsed.currentLevel ?? 1),
      unlockedLevel: Math.max(1, parsed.unlockedLevel ?? 1),
      bestByLevel: parsed.bestByLevel ?? {},
      recentHashes: parsed.recentHashes ?? [],
    };
  } catch {
    return createDefaultProgress();
  }
}

export function saveProgress(progress: StoredProgress): void {
  if (!globalThis.localStorage) {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function recordWin(progress: StoredProgress, meta: LevelMeta, moves: number, stars: number): StoredProgress {
  const key = String(meta.level);
  const currentBest = progress.bestByLevel[key];
  const better = !currentBest || moves < currentBest.moves || (moves === currentBest.moves && stars > currentBest.stars);

  return {
    currentLevel: Math.max(progress.currentLevel, meta.level + 1),
    unlockedLevel: Math.max(progress.unlockedLevel, meta.level + 1),
    bestByLevel: {
      ...progress.bestByLevel,
      ...(better
        ? {
            [key]: {
              moves,
              stars,
              optimalMoves: meta.optimalMoves,
              seed: meta.seed,
            },
          }
        : {}),
    },
    recentHashes: [meta.stateHash, ...progress.recentHashes.filter((hash) => hash !== meta.stateHash)].slice(0, RECENT_LIMIT),
  };
}

export function resetProgress(): StoredProgress {
  const progress = createDefaultProgress();
  saveProgress(progress);
  return progress;
}

function createDefaultProgress(): StoredProgress {
  return {
    currentLevel: 1,
    unlockedLevel: 1,
    bestByLevel: {},
    recentHashes: [],
  };
}
