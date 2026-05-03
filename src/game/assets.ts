import boardUrl from '../assets/board.png';
import blockHeroUrl from '../assets/block-hero.png';
import blockHorizontalUrl from '../assets/block-horizontal.png';
import blockSmallUrl from '../assets/block-small.png';
import blockVerticalUrl from '../assets/block-vertical.png';
import uiBannerUrl from '../assets/ui-banner.png';
import uiButtonUrl from '../assets/ui-button.png';
import uiStarUrl from '../assets/ui-star.png';

export const ASSETS = {
  board: boardUrl,
  blockHero: blockHeroUrl,
  blockHorizontal: blockHorizontalUrl,
  blockSmall: blockSmallUrl,
  blockVertical: blockVerticalUrl,
  uiBanner: uiBannerUrl,
  uiButton: uiButtonUrl,
  uiStar: uiStarUrl,
} as const;

export const BLOCK_TEXTURES = {
  hero: 'block-hero',
  horizontal: 'block-horizontal',
  small: 'block-small',
  vertical: 'block-vertical',
} as const;
