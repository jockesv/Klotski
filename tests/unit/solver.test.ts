import { describe, expect, it } from 'vitest';
import { applyMove, createSolvedState } from '../../src/puzzle/rules';
import { solvePuzzle } from '../../src/puzzle/solver';

describe('solver', () => {
  it('returns zero moves for an already solved board', () => {
    const result = solvePuzzle(createSolvedState());

    expect(result.solved).toBe(true);
    expect(result.optimalMoves).toBe(0);
  });

  it('finds a one-move solution for the hero just above the exit', () => {
    const state = applyMove(createSolvedState(), { blockId: 'H', dx: 0, dy: -1 });
    const result = solvePuzzle(state);

    expect(result.solved).toBe(true);
    expect(result.optimalMoves).toBe(1);
  });
});
