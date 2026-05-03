import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DIRECTIONS,
  GOAL_X,
  GOAL_Y,
  HERO_ID,
  type BlockSpec,
  type DirectionName,
  type Move,
  type PuzzleState,
} from './types';

export function cloneState(state: PuzzleState): PuzzleState {
  return {
    width: state.width,
    height: state.height,
    heroId: state.heroId,
    blocks: state.blocks.map((block) => ({ ...block })),
  };
}

export function createSolvedState(): PuzzleState {
  return {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    heroId: HERO_ID,
    blocks: [
      { id: HERO_ID, type: 'hero', w: 2, h: 2, x: 1, y: 3 },
      { id: 'V1', type: 'vertical', w: 1, h: 2, x: 0, y: 0 },
      { id: 'V2', type: 'vertical', w: 1, h: 2, x: 3, y: 0 },
      { id: 'V3', type: 'vertical', w: 1, h: 2, x: 0, y: 2 },
      { id: 'V4', type: 'vertical', w: 1, h: 2, x: 3, y: 2 },
      { id: 'W1', type: 'horizontal', w: 2, h: 1, x: 1, y: 0 },
      { id: 'A', type: 'small', w: 1, h: 1, x: 1, y: 1 },
      { id: 'B', type: 'small', w: 1, h: 1, x: 2, y: 1 },
      { id: 'C', type: 'small', w: 1, h: 1, x: 0, y: 4 },
      { id: 'D', type: 'small', w: 1, h: 1, x: 3, y: 4 },
    ],
  };
}

export function blockCells(block: BlockSpec): string[] {
  const cells: string[] = [];

  for (let y = 0; y < block.h; y += 1) {
    for (let x = 0; x < block.w; x += 1) {
      cells.push(`${block.x + x},${block.y + y}`);
    }
  }

  return cells;
}

export function findBlock(state: PuzzleState, blockId: string): BlockSpec | undefined {
  return state.blocks.find((block) => block.id === blockId);
}

export function buildOccupancy(state: PuzzleState, ignoredBlockId?: string): Map<string, string> {
  const occupancy = new Map<string, string>();

  for (const block of state.blocks) {
    if (block.id === ignoredBlockId) {
      continue;
    }

    for (const cell of blockCells(block)) {
      occupancy.set(cell, block.id);
    }
  }

  return occupancy;
}

export function canMove(state: PuzzleState, blockId: string, dx: number, dy: number): boolean {
  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    return false;
  }

  const block = findBlock(state, blockId);
  if (!block) {
    return false;
  }

  const movedBlock = { ...block, x: block.x + dx, y: block.y + dy };
  if (
    movedBlock.x < 0 ||
    movedBlock.y < 0 ||
    movedBlock.x + movedBlock.w > state.width ||
    movedBlock.y + movedBlock.h > state.height
  ) {
    return false;
  }

  const occupancy = buildOccupancy(state, blockId);
  return blockCells(movedBlock).every((cell) => !occupancy.has(cell));
}

export function applyMove(state: PuzzleState, move: Move): PuzzleState {
  if (!canMove(state, move.blockId, move.dx, move.dy)) {
    return cloneState(state);
  }

  return {
    width: state.width,
    height: state.height,
    heroId: state.heroId,
    blocks: state.blocks.map((block) =>
      block.id === move.blockId ? { ...block, x: block.x + move.dx, y: block.y + move.dy } : { ...block },
    ),
  };
}

export function moveForDirection(blockId: string, direction: DirectionName): Move {
  const directionMove = DIRECTIONS[direction];
  return {
    blockId,
    dx: directionMove.dx,
    dy: directionMove.dy,
  };
}

export function listLegalMoves(state: PuzzleState): Move[] {
  const moves: Move[] = [];

  for (const block of state.blocks) {
    for (const direction of Object.keys(DIRECTIONS) as DirectionName[]) {
      const move = moveForDirection(block.id, direction);
      if (canMove(state, block.id, move.dx, move.dy)) {
        moves.push(move);
      }
    }
  }

  return moves;
}

export function isSolved(state: PuzzleState): boolean {
  const hero = findBlock(state, state.heroId);
  return Boolean(hero && hero.x === GOAL_X && hero.y === GOAL_Y);
}

export function canonicalState(state: PuzzleState): string {
  const hero = findBlock(state, state.heroId);
  const groups = new Map<string, string[]>();

  for (const block of state.blocks) {
    if (block.id === state.heroId) {
      continue;
    }

    const groupKey = `${block.type}:${block.w}x${block.h}`;
    const positions = groups.get(groupKey) ?? [];
    positions.push(`${block.x},${block.y}`);
    groups.set(groupKey, positions);
  }

  const normalizedGroups = [...groups.entries()]
    .map(([groupKey, positions]) => `${groupKey}:${positions.sort().join(';')}`)
    .sort();

  return [`hero:${hero?.x ?? -1},${hero?.y ?? -1}`, ...normalizedGroups].join('|');
}

export function validateState(state: PuzzleState): boolean {
  if (state.width !== BOARD_WIDTH || state.height !== BOARD_HEIGHT) {
    return false;
  }

  const occupied = new Set<string>();

  for (const block of state.blocks) {
    if (block.x < 0 || block.y < 0 || block.x + block.w > state.width || block.y + block.h > state.height) {
      return false;
    }

    for (const cell of blockCells(block)) {
      if (occupied.has(cell)) {
        return false;
      }
      occupied.add(cell);
    }
  }

  return Boolean(findBlock(state, state.heroId));
}

export function stateAfterMoves(state: PuzzleState, moves: Move[]): PuzzleState {
  return moves.reduce((current, move) => applyMove(current, move), state);
}
