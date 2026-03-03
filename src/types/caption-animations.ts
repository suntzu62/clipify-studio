export type AnimationType = 'none' | 'highlight' | 'scale' | 'bounce' | 'glow' | 'background' | 'underline';
export type AnimationSpeed = 'slow' | 'normal' | 'fast';
export type HighlightEffect = 'scale-color' | 'color-only' | 'scale-only' | 'glow' | 'background' | 'underline';

export interface AnimationPreset {
  type?: AnimationType;
  highlightColor?: string;
  highlightEffect?: HighlightEffect;
  speed?: AnimationSpeed;
  scaleAmount?: number;
  glowIntensity?: number;
}

export const ANIMATION_PRESETS: Record<string, AnimationPreset> = {
  mrbeast: {
    type: 'highlight',
    highlightColor: '#FFFF00',
    highlightEffect: 'scale-color',
    speed: 'fast',
    scaleAmount: 1.3,
    glowIntensity: 3,
  },
  hormozi: {
    type: 'highlight',
    highlightColor: '#FF0000',
    highlightEffect: 'scale-color',
    speed: 'normal',
    scaleAmount: 1.2,
    glowIntensity: 5,
  },
  tiktokViral: {
    type: 'glow',
    highlightColor: '#00FFFF',
    highlightEffect: 'glow',
    speed: 'fast',
    scaleAmount: 1.15,
    glowIntensity: 10,
  },
  capcutTrending: {
    type: 'bounce',
    highlightColor: '#FF6B35',
    highlightEffect: 'scale-color',
    speed: 'fast',
    scaleAmount: 1.25,
    glowIntensity: 4,
  },
  instagramReels: {
    type: 'highlight',
    highlightColor: '#E1306C',
    highlightEffect: 'color-only',
    speed: 'normal',
    scaleAmount: 1.1,
    glowIntensity: 6,
  },
  minimal: {
    type: 'highlight',
    highlightColor: '#FFFFFF',
    highlightEffect: 'color-only',
    speed: 'normal',
    scaleAmount: 1.0,
    glowIntensity: 0,
  },
};
