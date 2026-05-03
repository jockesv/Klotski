import { describe, expect, it } from 'vitest';
import {
  applyMove,
  canMove,
  canonicalState,
  createSolvedState,
  isSolved,
  listLegalMoves,
  stateAfterMoves,
} from '../../src/puzzle/rules';

describe('puzzle rules', () => {
  it('recognizes the solved classic Klotski exit state', () => {
    const state = createSolvedState();

    expect(isSolved(state)).toBe(true);
  });

  it('rejects out-of-board and colliding moves', () => {
    const state = createSolvedState();

    expect(canMove(state, 'C', -1, 0)).toBe(false);
    expect(canMove(state, 'H', 0, 1)).toBe(false);
    expect(canMove(state, 'H', 1, 0)).toBe(false);
  });

  it('applies legal one-cell moves immutably', () => {
    const state = createSolvedState();
    const moved = applyMove(state, { blockId: 'A', dx: 0, dy: 1 });

    expect(moved).not.toBe(state);
    expect(moved.blocks.find((block) => block.id === 'A')).toMatchObject({ x: 1, y: 2 });
    expect(state.blocks.find((block) => block.id === 'A')).toMatchObject({ x: 1, y: 1 });
  });

  it('canonicalizes interchangeable same-size blockers', () => {
    const state = createSolvedState();
    const swapped = {
      ...state,
      blocks: state.blocks.map((block) => {
        if (block.id === 'A') {
          return { ...block, x: 2, y: 1 };
        }
        if (block.id === 'B') {
          return { ...block, x: 1, y: 1 };
        }
        return { ...block };
      }),
    };

    expect(canonicalState(swapped)).toBe(canonicalState(state));
  });

  it('lists only legal one-step moves', () => {
    const state = stateAfterMoves(createSolvedState(), [{ blockId: 'A', dx: 0, dy: 1 }]);
    const moves = listLegalMoves(state);

    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => Math.abs(move.dx) + Math.abs(move.dy) === 1)).toBe(true);
  });
});
