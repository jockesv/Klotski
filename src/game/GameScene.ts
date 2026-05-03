import Phaser from 'phaser';
import { ASSETS, BLOCK_TEXTURES } from './assets';
import { generateLevel } from '../puzzle/generator';
import {
  applyMove,
  canMove,
  cloneState,
  findBlock,
  isSolved,
  listLegalMoves,
} from '../puzzle/rules';
import {
  loadProgress,
  recordWin,
  saveProgress,
  type StoredProgress,
} from '../puzzle/storage';
import type { BlockSpec, DirectionName, LevelData, Move, PuzzleState } from '../puzzle/types';

interface BoardLayout {
  width: number;
  height: number;
  cell: number;
  rowCell: number;
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
  boardSize: number;
  boardX: number;
  boardY: number;
}

interface DragState {
  blockId: string;
  startX: number;
  startY: number;
  pointerX: number;
  pointerY: number;
  candidate?: Move;
}

interface KlotskiTestApi {
  getSnapshot: () => {
    level: number;
    moves: number;
    won: boolean;
    legalMoves: number;
  };
  moveFirstLegal: () => boolean;
  restart: () => void;
}

declare global {
  interface Window {
    __klotski?: KlotskiTestApi;
  }
}

export class GameScene extends Phaser.Scene {
  private layout!: BoardLayout;
  private progress!: StoredProgress;
  private levelData!: LevelData;
  private state!: PuzzleState;
  private initialState!: PuzzleState;
  private blockSprites = new Map<string, Phaser.GameObjects.Image>();
  private blockShadows = new Map<string, Phaser.GameObjects.Rectangle>();
  private history: PuzzleState[] = [];
  private moves = 0;
  private won = false;
  private isAnimating = false;
  private dragState?: DragState;
  private boardImage?: Phaser.GameObjects.Image;
  private gridGraphics?: Phaser.GameObjects.Graphics;
  private headerText?: Phaser.GameObjects.Text;
  private statsText?: Phaser.GameObjects.Text;
  private bestText?: Phaser.GameObjects.Text;
  private loadingText?: Phaser.GameObjects.Text;
  private restartButton?: Phaser.GameObjects.Container;
  private undoButton?: Phaser.GameObjects.Container;
  private nextButton?: Phaser.GameObjects.Container;
  private stars: Phaser.GameObjects.Image[] = [];
  private victoryGroup?: Phaser.GameObjects.Container;

  constructor() {
    super('game');
  }

  preload(): void {
    this.load.image('board', ASSETS.board);
    this.load.image('block-hero', ASSETS.blockHero);
    this.load.image('block-horizontal', ASSETS.blockHorizontal);
    this.load.image('block-small', ASSETS.blockSmall);
    this.load.image('block-vertical', ASSETS.blockVertical);
    this.load.image('ui-banner', ASSETS.uiBanner);
    this.load.image('ui-button', ASSETS.uiButton);
    this.load.image('ui-star', ASSETS.uiStar);
  }

  create(): void {
    this.progress = loadProgress();
    this.cameras.main.setBackgroundColor('#160f0a');
    this.layout = this.computeLayout();
    this.createStaticObjects();
    this.createUi();
    this.scale.on('resize', this.handleResize, this);
    this.installTestApi();
    this.loadLevel(this.progress.currentLevel);
  }

  private createStaticObjects(): void {
    this.boardImage = this.add.image(0, 0, 'board').setDepth(0);
    this.gridGraphics = this.add.graphics().setDepth(2);
    this.loadingText = this.add
      .text(0, 0, 'Carving puzzle...', {
        color: '#f8e7c7',
        fontFamily: 'Georgia, serif',
        fontSize: '26px',
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);
  }

  private createUi(): void {
    this.headerText = this.add
      .text(0, 0, '', {
        color: '#f6ddad',
        fontFamily: 'Georgia, serif',
        fontSize: '30px',
        fontStyle: '700',
      })
      .setOrigin(0.5);

    this.statsText = this.add
      .text(0, 0, '', {
        color: '#f8e7c7',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: '17px',
        fontStyle: '700',
      })
      .setOrigin(0.5);

    this.bestText = this.add
      .text(0, 0, '', {
        color: '#d7b675',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: '14px',
      })
      .setOrigin(0.5);

    this.restartButton = this.createButton('Restart', () => this.restartLevel());
    this.undoButton = this.createButton('Undo', () => this.undoMove());
    this.nextButton = this.createButton('Next', () => this.goToNextLevel());

    for (let i = 0; i < 3; i += 1) {
      const star = this.add.image(0, 0, 'ui-star');
      star.setDepth(12);
      this.stars.push(star);
    }

    this.layoutUi();
  }

  private createButton(label: string, onClick: () => void): Phaser.GameObjects.Container {
    const background = this.add
      .image(0, 0, 'ui-button')
      .setDisplaySize(132, 44);
    const text = this.add
      .text(0, 0, label, {
        color: '#fff2d7',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: '16px',
        fontStyle: '800',
      })
      .setOrigin(0.5);
    const container = this.add.container(0, 0, [background, text]).setDepth(12);
    container.setSize(132, 44);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerdown', () => {
      if (!this.isAnimating) {
        onClick();
      }
    });
    container.on('pointerover', () => background.setTint(0xffefc4));
    container.on('pointerout', () => background.clearTint());
    return container;
  }

  private loadLevel(level: number): void {
    this.setLoading(true);
    this.time.delayedCall(20, () => {
      this.levelData = generateLevel(level, this.progress.recentHashes);
      this.state = cloneState(this.levelData.state);
      this.initialState = cloneState(this.levelData.state);
      this.moves = 0;
      this.history = [];
      this.won = false;
      this.progress.currentLevel = level;
      saveProgress(this.progress);
      this.syncBlocks(true);
      this.updateUi();
      this.setLoading(false);
    });
  }

  private setLoading(loading: boolean): void {
    this.loadingText?.setVisible(loading);
    this.loadingText?.setPosition(this.scale.width / 2, this.scale.height / 2);
    this.isAnimating = loading;
  }

  private syncBlocks(recreate = false): void {
    if (!this.state) {
      return;
    }

    if (recreate) {
      for (const sprite of this.blockSprites.values()) {
        sprite.destroy();
      }
      for (const shadow of this.blockShadows.values()) {
        shadow.destroy();
      }
      this.blockSprites.clear();
      this.blockShadows.clear();
    }

    for (const block of this.state.blocks) {
      let sprite = this.blockSprites.get(block.id);
      let shadow = this.blockShadows.get(block.id);

      if (!sprite) {
        sprite = this.createBlockSprite(block);
        this.blockSprites.set(block.id, sprite);
      }

      if (!shadow) {
        shadow = this.createBlockShadow(block);
        this.blockShadows.set(block.id, shadow);
      }

      this.placeBlockShadow(shadow, block);
      this.placeBlockSprite(sprite, block);
    }
  }

  private createBlockSprite(block: BlockSpec): Phaser.GameObjects.Image {
    const sprite = this.add
      .image(0, 0, BLOCK_TEXTURES[block.type])
      .setDepth(block.type === 'hero' ? 6 : 5)
      .setInteractive({ useHandCursor: true });

    sprite.setData('blockId', block.id);
    this.input.setDraggable(sprite);

    sprite.on('dragstart', (pointer: Phaser.Input.Pointer) => this.onDragStart(block.id, sprite, pointer));
    sprite.on('drag', (pointer: Phaser.Input.Pointer) => this.onDrag(sprite, pointer));
    sprite.on('dragend', () => this.onDragEnd(sprite));
    sprite.on('pointerover', () => {
      if (!this.isAnimating && !this.won) {
        sprite.setTint(0xffedc4);
      }
    });
    sprite.on('pointerout', () => {
      if (!this.dragState) {
        sprite.clearTint();
      }
    });

    return sprite;
  }

  private createBlockShadow(block: BlockSpec): Phaser.GameObjects.Rectangle {
    return this.add
      .rectangle(0, 0, 1, 1, 0x0a0502, block.type === 'hero' ? 0.36 : 0.3)
      .setDepth(block.type === 'hero' ? 5 : 4);
  }

  private placeBlockSprite(sprite: Phaser.GameObjects.Image, block: BlockSpec): void {
    const center = this.blockCenter(block);
    const size = this.blockVisualSize(block);
    sprite
      .setPosition(center.x, center.y)
      .setDisplaySize(size.width, size.height);
  }

  private placeBlockShadow(shadow: Phaser.GameObjects.Rectangle, block: BlockSpec): void {
    const center = this.blockCenter(block);
    const size = this.blockVisualSize(block);
    shadow
      .setPosition(center.x + this.shadowOffset(), center.y + this.shadowOffset())
      .setSize(size.width * 0.92, size.height * 0.92);
  }

  private blockVisualSize(block: BlockSpec): { width: number; height: number } {
    const gap = Math.max(16, Math.floor(this.layout.cell * 0.18));
    return {
      width: block.w * this.layout.cell - gap,
      height: block.h * this.layout.rowCell - gap,
    };
  }

  private shadowOffset(): number {
    return Math.max(3, Math.floor(this.layout.cell * 0.045));
  }

  private onDragStart(blockId: string, sprite: Phaser.GameObjects.Image, pointer: Phaser.Input.Pointer): void {
    if (this.isAnimating || this.won) {
      return;
    }

    this.dragState = {
      blockId,
      startX: sprite.x,
      startY: sprite.y,
      pointerX: pointer.x,
      pointerY: pointer.y,
    };
    sprite.setDepth(9).setTint(0xfff0bf);
    this.blockShadows.get(blockId)?.setDepth(8);
  }

  private onDrag(sprite: Phaser.GameObjects.Image, pointer: Phaser.Input.Pointer): void {
    if (!this.dragState || this.isAnimating || this.won) {
      return;
    }

    const dx = pointer.x - this.dragState.pointerX;
    const dy = pointer.y - this.dragState.pointerY;
    const direction = this.directionFromDelta(dx, dy);

    if (!direction) {
      return;
    }

    const move = directionToMove(this.dragState.blockId, direction);
    const axisDelta = direction === 'up' || direction === 'down' ? dy : dx;
    const maxDistance = direction === 'up' || direction === 'down' ? this.layout.rowCell : this.layout.cell;
    const distance = Math.min(Math.max(Math.abs(axisDelta), 0), maxDistance);
    const legal = canMove(this.state, move.blockId, move.dx, move.dy);
    const visualDistance = legal ? distance : Math.min(distance, maxDistance * 0.13);

    this.dragState.candidate = legal ? move : undefined;
    sprite.setPosition(
      this.dragState.startX + move.dx * visualDistance,
      this.dragState.startY + move.dy * visualDistance,
    );
    this.blockShadows
      .get(this.dragState.blockId)
      ?.setPosition(sprite.x + this.shadowOffset(), sprite.y + this.shadowOffset());
  }

  private onDragEnd(sprite: Phaser.GameObjects.Image): void {
    if (!this.dragState) {
      return;
    }

    const candidate = this.dragState.candidate;
    const startX = this.dragState.startX;
    const startY = this.dragState.startY;
    const movedEnough = candidate
      ? Math.abs(sprite.x - startX) + Math.abs(sprite.y - startY) > this.layout.cell * 0.3
      : false;

    sprite.clearTint();
    const shadow = this.blockShadows.get(sprite.getData('blockId'));
    this.dragState = undefined;

    if (candidate && movedEnough) {
      this.commitMove(candidate, true);
    } else {
      this.tweens.add({
        targets: sprite,
        x: startX,
        y: startY,
        duration: 110,
        ease: 'Back.easeOut',
        onComplete: () => sprite.setDepth(sprite.getData('blockId') === this.state.heroId ? 6 : 5),
      });
      this.tweens.add({
        targets: shadow,
        x: startX + this.shadowOffset(),
        y: startY + this.shadowOffset(),
        duration: 110,
        ease: 'Back.easeOut',
        onComplete: () => shadow?.setDepth(sprite.getData('blockId') === this.state.heroId ? 5 : 4),
      });
    }
  }

  private commitMove(move: Move, animated: boolean): boolean {
    if (this.isAnimating || this.won || !canMove(this.state, move.blockId, move.dx, move.dy)) {
      return false;
    }

    this.history.push(cloneState(this.state));
    this.state = applyMove(this.state, move);
    this.moves += 1;
    this.updateUi();

    const movedBlock = findBlock(this.state, move.blockId);
    const sprite = this.blockSprites.get(move.blockId);
    if (!movedBlock || !sprite) {
      return false;
    }

    const target = this.blockCenter(movedBlock);
    const shadow = this.blockShadows.get(move.blockId);
    this.isAnimating = animated;

    this.tweens.add({
      targets: sprite,
      x: target.x,
      y: target.y,
      duration: animated ? 130 : 0,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        sprite.setDepth(movedBlock.type === 'hero' ? 6 : 5).clearTint();
        this.isAnimating = false;
        this.syncBlocks(false);
        this.checkWin();
      },
    });
    this.tweens.add({
      targets: shadow,
      x: target.x + this.shadowOffset(),
      y: target.y + this.shadowOffset(),
      duration: animated ? 130 : 0,
      ease: 'Cubic.easeOut',
      onComplete: () => shadow?.setDepth(movedBlock.type === 'hero' ? 5 : 4),
    });

    return true;
  }

  private checkWin(): void {
    if (!isSolved(this.state) || this.won) {
      return;
    }

    this.won = true;
    const stars = this.calculateStars();
    this.progress = recordWin(this.progress, this.levelData.meta, this.moves, stars);
    saveProgress(this.progress);
    this.updateUi();
    this.showVictory(stars);
  }

  private calculateStars(): number {
    const { optimalMoves, par } = this.levelData.meta;
    if (this.moves <= optimalMoves) {
      return 3;
    }
    if (this.moves <= par) {
      return 2;
    }
    return 1;
  }

  private showVictory(starCount: number): void {
    this.victoryGroup?.destroy(true);
    const starLabel = starCount === 1 ? 'star' : 'stars';
    const banner = this.add
      .image(0, 0, 'ui-banner')
      .setDisplaySize(Math.min(this.scale.width - 34, 520), 122);
    const text = this.add
      .text(0, 7, 'Cleared', {
        color: '#fff0ce',
        fontFamily: 'Georgia, serif',
        fontSize: '28px',
        fontStyle: '700',
        stroke: '#5b260e',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const subtext = this.add
      .text(0, 38, `${this.moves} moves  |  ${starCount} ${starLabel}`, {
        color: '#f6d999',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: '15px',
        fontStyle: '800',
        stroke: '#5b260e',
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    this.victoryGroup = this.add
      .container(this.scale.width / 2, this.layout.gridY + this.layout.gridHeight * 0.45, [banner, text, subtext])
      .setDepth(30)
      .setAlpha(0)
      .setScale(0.96);
    this.tweens.add({
      targets: this.victoryGroup,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.addVictorySheen();
  }

  private addVictorySheen(): void {
    const hero = findBlock(this.state, this.state.heroId);
    const sprite = hero ? this.blockSprites.get(hero.id) : undefined;
    if (!hero || !sprite) {
      return;
    }

    const shine = this.add.rectangle(sprite.x - sprite.displayWidth / 2, sprite.y, 16, sprite.displayHeight, 0xfff0bb, 0.32);
    shine.setDepth(9).setAngle(-18);
    this.tweens.add({
      targets: shine,
      x: sprite.x + sprite.displayWidth / 2,
      alpha: 0,
      duration: 520,
      ease: 'Sine.easeOut',
      onComplete: () => shine.destroy(),
    });
  }

  private restartLevel(): void {
    if (!this.initialState || this.isAnimating) {
      return;
    }

    this.victoryGroup?.destroy(true);
    this.won = false;
    this.moves = 0;
    this.history = [];
    this.state = cloneState(this.initialState);
    this.syncBlocks(true);
    this.updateUi();
  }

  private undoMove(): void {
    if (this.isAnimating || this.won || this.history.length === 0) {
      return;
    }

    const previous = this.history.pop();
    if (!previous) {
      return;
    }

    this.state = previous;
    this.moves = Math.max(0, this.moves - 1);
    this.syncBlocks(false);
    this.updateUi();
  }

  private goToNextLevel(): void {
    if (this.isAnimating) {
      return;
    }

    const nextLevel = Math.min(this.progress.unlockedLevel, this.levelData.meta.level + 1);
    if (nextLevel <= this.levelData.meta.level && !this.won) {
      return;
    }

    this.victoryGroup?.destroy(true);
    this.loadLevel(this.levelData.meta.level + 1);
  }

  private updateUi(): void {
    if (!this.levelData) {
      return;
    }

    const meta = this.levelData.meta;
    const best = this.progress.bestByLevel[String(meta.level)];
    const bestText = best ? `Best ${best.moves} moves / ${best.stars} stars` : 'No clear yet';
    const starCount = this.won ? this.calculateStars() : best?.stars ?? 0;

    this.headerText?.setText(`Klotski  Level ${meta.level}`);
    this.statsText?.setText(`Moves ${this.moves}  |  Optimal ${meta.optimalMoves}  |  Par ${meta.par}  |  ${meta.tier}`);
    this.bestText?.setText(bestText);

    this.stars.forEach((star, index) => {
      star.setAlpha(index < starCount ? 1 : 0.22);
      star.setTint(index < starCount ? 0xffffff : 0x7a5d3b);
    });

    this.undoButton?.setAlpha(this.history.length > 0 && !this.won ? 1 : 0.48);
    this.nextButton?.setAlpha(this.won || meta.level < this.progress.unlockedLevel ? 1 : 0.48);
  }

  private computeLayout(): BoardLayout {
    const width = this.scale.width;
    const height = this.scale.height;
    const baseCell = Math.floor(Math.max(48, Math.min((width - 28) / 5.15, (height - 174) / 6.55, 112)));
    const baseRowCell = Math.floor(baseCell * 0.91);
    const baseGridHeight = baseRowCell * 5;
    let baseGridY = Math.round(height / 2 - baseGridHeight / 2 + 22);
    baseGridY = Math.max(104, baseGridY);
    baseGridY = Math.min(baseGridY, height - baseGridHeight - 74);
    const boardSize = Math.min(
      Math.max(baseCell * 4 + baseCell * 1.8, baseGridHeight + baseRowCell * 1.7),
      width * 0.98,
      height * 0.86,
    );
    const boardX = width / 2;
    const boardY = baseGridY + baseGridHeight / 2 + baseCell * 0.08;
    const boardLeft = boardX - boardSize / 2;
    const boardTop = boardY - boardSize / 2;
    const gridX = Math.round(boardLeft + boardSize * 0.184);
    const gridY = Math.round(boardTop + boardSize * 0.126);
    const gridWidth = boardSize * 0.632;
    const gridHeight = boardSize * 0.716;
    const cell = gridWidth / 4;
    const rowCell = gridHeight / 5;

    return {
      width,
      height,
      cell,
      rowCell,
      gridX,
      gridY,
      gridWidth,
      gridHeight,
      boardSize,
      boardX,
      boardY,
    };
  }

  private layoutUi(): void {
    this.layout = this.computeLayout();
    this.boardImage?.setPosition(this.layout.boardX, this.layout.boardY).setDisplaySize(this.layout.boardSize, this.layout.boardSize);
    this.loadingText?.setPosition(this.layout.width / 2, this.layout.height / 2);

    this.headerText?.setPosition(this.layout.width / 2, 32);
    this.statsText?.setPosition(this.layout.width / 2, 64);
    this.bestText?.setPosition(this.layout.width / 2, 86);

    const buttonY = Math.min(this.layout.height - 44, this.layout.gridY + this.layout.gridHeight + 44);
    const spacing = Math.min(145, this.layout.width / 3.15);
    this.restartButton?.setPosition(this.layout.width / 2 - spacing, buttonY);
    this.undoButton?.setPosition(this.layout.width / 2, buttonY);
    this.nextButton?.setPosition(this.layout.width / 2 + spacing, buttonY);

    this.stars.forEach((star, index) => {
      star.setPosition(this.layout.width / 2 + (index - 1) * 30, 112).setDisplaySize(28, 30);
    });

    this.drawGridOverlay();
    this.syncBlocks(false);
  }

  private drawGridOverlay(): void {
    const graphics = this.gridGraphics;
    if (!graphics) {
      return;
    }

    graphics.clear();
    graphics.lineStyle(2, 0x3e2415, 0.42);
    for (let x = 0; x <= 4; x += 1) {
      const lineX = this.layout.gridX + x * this.layout.cell;
      graphics.lineBetween(lineX, this.layout.gridY, lineX, this.layout.gridY + this.layout.gridHeight);
    }
    for (let y = 0; y <= 5; y += 1) {
      const lineY = this.layout.gridY + y * this.layout.rowCell;
      graphics.lineBetween(this.layout.gridX, lineY, this.layout.gridX + this.layout.gridWidth, lineY);
    }
    graphics.lineStyle(5, 0xf0b562, 0.75);
    graphics.lineBetween(
      this.layout.gridX + this.layout.cell,
      this.layout.gridY + this.layout.gridHeight,
      this.layout.gridX + this.layout.cell * 3,
      this.layout.gridY + this.layout.gridHeight,
    );
  }

  private handleResize(): void {
    this.layoutUi();
    if (this.victoryGroup) {
      this.victoryGroup.setPosition(this.scale.width / 2, this.layout.gridY + this.layout.gridHeight * 0.45);
    }
  }

  private blockCenter(block: BlockSpec): { x: number; y: number } {
    return {
      x: this.layout.gridX + (block.x + block.w / 2) * this.layout.cell,
      y: this.layout.gridY + (block.y + block.h / 2) * this.layout.rowCell,
    };
  }

  private directionFromDelta(dx: number, dy: number): DirectionName | undefined {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < Math.min(this.layout.cell, this.layout.rowCell) * 0.12) {
      return undefined;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    }

    return dy > 0 ? 'down' : 'up';
  }

  private installTestApi(): void {
    window.__klotski = {
      getSnapshot: () => ({
        level: this.levelData?.meta.level ?? 0,
        moves: this.moves,
        won: this.won,
        legalMoves: this.state ? listLegalMoves(this.state).length : 0,
      }),
      moveFirstLegal: () => {
        const legalMove = this.state ? listLegalMoves(this.state)[0] : undefined;
        return legalMove ? this.commitMove(legalMove, false) : false;
      },
      restart: () => this.restartLevel(),
    };
  }
}

function directionToMove(blockId: string, direction: DirectionName): Move {
  switch (direction) {
    case 'up':
      return { blockId, dx: 0, dy: -1 };
    case 'down':
      return { blockId, dx: 0, dy: 1 };
    case 'left':
      return { blockId, dx: -1, dy: 0 };
    case 'right':
      return { blockId, dx: 1, dy: 0 };
  }
}
