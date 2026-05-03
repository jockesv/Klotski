import { describe, expect, it } from 'vitest';
import { difficultyBandForLevel, generateLevel } from '../../src/puzzle/generator';
import { canonicalState, validateState } from '../../src/puzzle/rules';

describe('level generator', () => {
  it('generates deterministic valid levels', () => {
    const first = generateLevel(4);
    const second = generateLevel(4);

    expect(validateState(first.state)).toBe(true);
    expect(canonicalState(first.state)).toBe(canonicalState(second.state));
    expect(first.meta.seed).toBe(second.meta.seed);
    expect(first.meta.optimalMoves).toBe(second.meta.optimalMoves);
  });

  it('ramps target bands upward through the campaign', () => {
    const early = difficultyBandForLevel(1);
    const later = difficultyBandForLevel(20);

    expect(later.minOptimal).toBeGreaterThan(early.minOptimal);
    expect(later.maxOptimal).toBeGreaterThan(early.maxOptimal);
  });

  it('grades generated levels with solver metadata', () => {
    const level = generateLevel(8);
    const band = difficultyBandForLevel(8);

    expect(level.meta.optimalMoves).toBeGreaterThanOrEqual(1);
    expect(level.meta.optimalMoves).toBeLessThanOrEqual(band.maxOptimal + 12);
    expect(level.meta.difficultyScore).toBeGreaterThan(0);
  });
});
