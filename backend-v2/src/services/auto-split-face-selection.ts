import type { FaceDetectionBox } from './roi-detector.js';

export interface AutoSplitFaceSample {
  timestamp: number;
  frameWidth: number;
  frameHeight: number;
  faces: FaceDetectionBox[];
}

export interface AutoSplitFaceSelectionOptions {
  minScore?: number;
  minAreaRatio?: number;
  minHorizontalSeparationRatio?: number;
}

export interface AutoSplitFacePair {
  left: FaceDetectionBox;
  right: FaceDetectionBox;
  strategy: 'same-frame' | 'cross-frame';
}

type Candidate = FaceDetectionBox & {
  timestamp: number;
  frameWidth: number;
  frameHeight: number;
  centerX: number;
  centerY: number;
  area: number;
  areaRatio: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSampleFaces(
  sample: AutoSplitFaceSample,
  minScore: number,
  minAreaRatio: number
): Candidate[] {
  const frameArea = Math.max(1, sample.frameWidth * sample.frameHeight);

  return (sample.faces || [])
    .filter((face) =>
      Number.isFinite(face.x) &&
      Number.isFinite(face.y) &&
      Number.isFinite(face.width) &&
      Number.isFinite(face.height) &&
      Number.isFinite(face.score)
    )
    .filter((face) => face.width > 0 && face.height > 0 && face.score >= minScore)
    .map((face) => {
      const area = face.width * face.height;
      return {
        ...face,
        timestamp: sample.timestamp,
        frameWidth: sample.frameWidth,
        frameHeight: sample.frameHeight,
        centerX: face.x + face.width / 2,
        centerY: face.y + face.height / 2,
        area,
        areaRatio: area / frameArea,
      } as Candidate;
    })
    .filter((face) => face.areaRatio >= minAreaRatio)
    .sort((a, b) => (b.area * b.score) - (a.area * a.score));
}

function scoreSameFramePair(a: Candidate, b: Candidate): number {
  const frameWidth = Math.max(1, a.frameWidth);
  const centerDistance = Math.abs(a.centerX - b.centerX) / frameWidth;
  const avgScore = (a.score + b.score) / 2;
  const sizeBalance = Math.min(a.area, b.area) / Math.max(1, Math.max(a.area, b.area));

  return centerDistance * 0.55 + avgScore * 0.30 + sizeBalance * 0.15;
}

function toFaceBox(candidate: Candidate): FaceDetectionBox {
  return {
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
    score: candidate.score,
  };
}

function selectStrongest(candidates: Candidate[]): Candidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const aWeight = a.score * (1 + Math.min(1, a.areaRatio * 60));
    const bWeight = b.score * (1 + Math.min(1, b.areaRatio * 60));
    return bWeight - aWeight;
  });
  return sorted[0] || null;
}

export function selectAutoSplitFacePair(
  samples: AutoSplitFaceSample[],
  options: AutoSplitFaceSelectionOptions = {}
): AutoSplitFacePair | null {
  const minScore = options.minScore ?? 0.35;
  const minAreaRatio = options.minAreaRatio ?? 0.004;
  const minHorizontalSeparationRatio = clamp(options.minHorizontalSeparationRatio ?? 0.22, 0.1, 0.8);

  const usableSamples = samples
    .filter((sample) => sample.frameWidth > 0 && sample.frameHeight > 0)
    .map((sample) => ({
      sample,
      normalizedFaces: normalizeSampleFaces(sample, minScore, minAreaRatio),
    }))
    .filter(({ normalizedFaces }) => normalizedFaces.length > 0);

  if (usableSamples.length === 0) {
    return null;
  }

  // Priority 1: if we find 2 significant faces in the same frame, use that pair.
  let bestSameFrame:
    | {
      left: Candidate;
      right: Candidate;
      score: number;
    }
    | null = null;

  for (const { normalizedFaces } of usableSamples) {
    if (normalizedFaces.length < 2) continue;

    for (let i = 0; i < normalizedFaces.length - 1; i++) {
      for (let j = i + 1; j < normalizedFaces.length; j++) {
        const first = normalizedFaces[i];
        const second = normalizedFaces[j];
        const left = first.centerX <= second.centerX ? first : second;
        const right = first.centerX <= second.centerX ? second : first;
        const separationRatio = (right.centerX - left.centerX) / Math.max(1, left.frameWidth);
        if (separationRatio < minHorizontalSeparationRatio) continue;

        const pairScore = scoreSameFramePair(left, right);
        if (!bestSameFrame || pairScore > bestSameFrame.score) {
          bestSameFrame = { left, right, score: pairScore };
        }
      }
    }
  }

  if (bestSameFrame) {
    return {
      left: toFaceBox(bestSameFrame.left),
      right: toFaceBox(bestSameFrame.right),
      strategy: 'same-frame',
    };
  }

  // Priority 2: fallback for "turn-taking" cuts.
  // We require repeated faces on left and right sides across multiple timestamps.
  const primaryPerSample = usableSamples.map(({ normalizedFaces }) => normalizedFaces[0]).filter(Boolean) as Candidate[];
  if (primaryPerSample.length < 4) {
    return null;
  }

  const frameWidth = primaryPerSample[0].frameWidth;
  const leftSide = primaryPerSample.filter((face) => face.centerX <= frameWidth * 0.46);
  const rightSide = primaryPerSample.filter((face) => face.centerX >= frameWidth * 0.54);

  if (leftSide.length < 2 || rightSide.length < 2) {
    return null;
  }

  const left = selectStrongest(leftSide);
  const right = selectStrongest(rightSide);
  if (!left || !right) {
    return null;
  }

  const orderedLeft = left.centerX <= right.centerX ? left : right;
  const orderedRight = left.centerX <= right.centerX ? right : left;
  const separationRatio = (orderedRight.centerX - orderedLeft.centerX) / Math.max(1, frameWidth);
  if (separationRatio < minHorizontalSeparationRatio) {
    return null;
  }

  return {
    left: toFaceBox(orderedLeft),
    right: toFaceBox(orderedRight),
    strategy: 'cross-frame',
  };
}
