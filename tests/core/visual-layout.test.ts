import { describe, expect, it } from 'vitest';
import { choosePageBreak, fitVisualBlock } from '../../src/core/visual-layout.js';

describe('visual layout', () => {
  it('scales a visual proportionally into the available bounds', () => {
    expect(fitVisualBlock(
      { width: 1000, height: 500 },
      { maxWidth: 487, maxHeight: 700 },
    )).toEqual({ width: 487, height: 243.5, scale: 0.487 });
  });

  it('does not enlarge a visual that already fits', () => {
    expect(fitVisualBlock(
      { width: 200, height: 100 },
      { maxWidth: 487, maxHeight: 700 },
    )).toEqual({ width: 200, height: 100, scale: 1 });
  });

  it('moves a visual and its caption together when their combined height does not fit', () => {
    expect(choosePageBreak({ remaining: 180, visualHeight: 150, captionHeight: 48 })).toBe(true);
    expect(choosePageBreak({ remaining: 220, visualHeight: 150, captionHeight: 48 })).toBe(false);
  });
});
