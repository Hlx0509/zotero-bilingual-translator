export function fitVisualBlock(
  source: { width: number; height: number },
  bounds: { maxWidth: number; maxHeight: number },
): { width: number; height: number; scale: number } {
  if (source.width <= 0 || source.height <= 0 || bounds.maxWidth <= 0 || bounds.maxHeight <= 0) {
    throw new Error('Visual dimensions must be positive');
  }
  const scale = Math.min(1, bounds.maxWidth / source.width, bounds.maxHeight / source.height);
  return { width: source.width * scale, height: source.height * scale, scale };
}

export function choosePageBreak(input: {
  remaining: number;
  visualHeight: number;
  captionHeight: number;
}): boolean {
  return input.visualHeight + input.captionHeight > input.remaining;
}
