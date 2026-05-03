export const BOARD_WIDTH = 4;
export const BOARD_HEIGHT = 5;
export const HERO_ID = 'H';
export const GOAL_X = 1;
export const GOAL_Y = 3;

export type BlockType = 'hero' | 'small' | 'horizontal' | 'vertical';
export type DirectionName = 'up' | 'down' | 'left' | 'right';

export interface BlockSpec {
  id: string;
  type: BlockType;
  w: number;
  h: number;
  x: number;
  y: number;
}

export interface PuzzleState {
  width: number;
  height: number;
  heroId: string;
  blocks: BlockSpec[];
}

export interface Move {
  blockId: string;
  dx: number;
  dy: number;
}

export interface LevelMeta {
  level: number;
  seed: string;
  optimalMoves: number;
  par: number;
  difficultyScore: number;
  branchingFactor: number;
  blockerMoves: number;
  stateHash: string;
  tier: string;
}

export interface LevelData {
  state: PuzzleState;
  meta: LevelMeta;
}

export const DIRECTIONS: Record<DirectionName, Move> = {
  up: { blockId: '', dx: 0, dy: -1 },
  down: { blockId: '', dx: 0, dy: 1 },
  left: { blockId: '', dx: -1, dy: 0 },
  right: { blockId: '', dx: 1, dy: 0 },
};
