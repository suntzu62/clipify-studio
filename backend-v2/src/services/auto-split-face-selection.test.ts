import { describe, expect, it } from 'vitest';
import { selectAutoSplitFacePair, type AutoSplitFaceSample } from './auto-split-face-selection.js';

function sample(
  timestamp: number,
  faces: Array<{ x: number; y: number; width: number; height: number; score: number }>
): AutoSplitFaceSample {
  return {
    timestamp,
    frameWidth: 1080,
    frameHeight: 1920,
    faces,
  };
}

describe('auto-split-face-selection', () => {
  it('should choose a same-frame pair when both faces are visible together', () => {
    const result = selectAutoSplitFacePair([
      sample(1.2, [
        { x: 130, y: 520, width: 240, height: 240, score: 0.95 },
        { x: 720, y: 500, width: 230, height: 230, score: 0.91 },
      ]),
    ]);

    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('same-frame');
    expect(result!.left.x).toBeLessThan(result!.right.x);
  });

  it('should fallback to cross-frame pair for turn-taking conversation cuts', () => {
    const result = selectAutoSplitFacePair([
      sample(1.0, [{ x: 120, y: 500, width: 240, height: 240, score: 0.92 }]),
      sample(2.2, [{ x: 740, y: 520, width: 235, height: 235, score: 0.90 }]),
      sample(3.1, [{ x: 140, y: 510, width: 250, height: 250, score: 0.93 }]),
      sample(4.0, [{ x: 720, y: 500, width: 245, height: 245, score: 0.91 }]),
    ]);

    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('cross-frame');
    expect(result!.left.x).toBeLessThan(result!.right.x);
  });

  it('should return null when only one side appears once (single-person motion)', () => {
    const result = selectAutoSplitFacePair([
      sample(1.0, [{ x: 120, y: 500, width: 240, height: 240, score: 0.92 }]),
      sample(2.0, [{ x: 460, y: 510, width: 238, height: 238, score: 0.90 }]),
      sample(3.0, [{ x: 780, y: 520, width: 235, height: 235, score: 0.89 }]),
    ]);

    expect(result).toBeNull();
  });

  it('should ignore tiny background faces and keep significant participants', () => {
    const result = selectAutoSplitFacePair([
      sample(1.0, [
        { x: 110, y: 500, width: 250, height: 250, score: 0.93 },
        { x: 860, y: 120, width: 42, height: 42, score: 0.98 }, // tiny false positive
        { x: 710, y: 500, width: 240, height: 240, score: 0.91 },
      ]),
    ]);

    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('same-frame');
    expect(result!.left.width).toBeGreaterThan(100);
    expect(result!.right.width).toBeGreaterThan(100);
  });
});
