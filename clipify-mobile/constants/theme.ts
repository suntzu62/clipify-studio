// Design System Vizard - Cores do Clipify Web
// Paleta baseada em HSL convertida para hex para React Native

export const colors = {
  // Roxo primário (hsl 262 83% 58%) - Cor principal do Clipify
  primary: {
    50: '#f5f3ff',    // Muito claro
    100: '#ede9fe',   // Claro
    200: '#ddd6fe',   // Claro médio
    300: '#c4b5fd',   // Médio claro (glow - hsl 262 83% 70%)
    400: '#a78bfa',   // Médio (hover - hsl 262 83% 65%)
    500: '#8b5cf6',   // Base (hsl 262 83% 58%)
    600: '#7c3aed',   // Escuro médio
    700: '#6d28d9',   // Escuro
    800: '#5b21b6',   // Muito escuro
    900: '#4c1d95',   // Extremo escuro
  },
  // Azul claro secundário (hsl 220 14.3% 95.9%)
  secondary: {
    50: '#f8fafc',    // hsl 210 20% 98%
    100: '#f1f5f9',   // hsl 220 14.3% 95.9%
    200: '#e2e8f0',   // hsl 214 13.5% 91.3%
    300: '#cbd5e1',   // hsl 212 12.8% 83.3%
    400: '#94a3b8',   // hsl 215 13.8% 65.9%
    500: '#64748b',   // hsl 215 13.9% 51%
    600: '#475569',   // hsl 215 19.3% 34.5%
    700: '#334155',   // hsl 215 25% 26.7%
    800: '#1e293b',   // hsl 217 32.6% 17.5%
    900: '#0f172a',   // hsl 220.9 39.3% 11% - Texto escuro
  },
  // Escala neutra de cinzas
  gray: {
    50: '#fafafa',    // hsl 210 20% 98%
    100: '#f4f4f5',   // hsl 220 13% 96%
    200: '#e4e4e7',   // hsl 220 13% 91%
    300: '#d4d4d8',   // hsl 220 9% 84%
    400: '#a1a1aa',   // hsl 220 9% 65%
    500: '#71717a',   // hsl 220 9% 48%
    600: '#52525b',   // hsl 220 13% 35%
    700: '#3f3f46',   // hsl 220 13% 26%
    800: '#27272a',   // hsl 220 22% 16%
    900: '#18181b',   // hsl 221 39% 11%
  },
  // Estados e feedback
  success: '#16a34a',   // hsl 142 76% 36%
  warning: '#f59e0b',   // hsl 38 92% 50%
  error: '#ef4444',     // hsl 0 84% 60%
  info: '#0ea5e9',      // hsl 199 89% 48%

  // Cores específicas do tema
  background: {
    light: '#ffffff',
    dark: '#0f172a',    // secondary-900
  },
  text: {
    light: '#0f172a',   // secondary-900 - hsl 220.9 39.3% 11%
    dark: '#f1f5f9',    // secondary-100
  },
  border: {
    light: '#e2e8f0',   // secondary-200
    dark: '#334155',    // secondary-700
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
};

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  // Glow effect para elementos com destaque (roxo)
  glow: {
    shadowColor: '#8b5cf6', // primary-500
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
};

// Gradientes (cores para usar com expo-linear-gradient)
export const gradients = {
  primary: ['#8b5cf6', '#c4b5fd'], // 135deg, primary-500 to primary-300 (glow)
  hero: ['#7c3aed', '#a78bfa'],    // primary-600 to primary-400
  card: ['#8b5cf6', '#6d28d9'],    // primary-500 to primary-700
  success: ['#16a34a', '#22c55e'],
  warning: ['#f59e0b', '#fbbf24'],
  info: ['#0ea5e9', '#38bdf8'],
};

// Animações - Duração em ms (usar com Animated API ou react-native-reanimated)
export const animations = {
  duration: {
    fast: 150,
    normal: 300,    // 0.3s cubic-bezier(0.4, 0, 0.2, 1)
    slow: 500,
  },
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)', // Mesma curva do web
};

// Opacidade para estados
export const opacity = {
  disabled: 0.5,
  hover: 0.8,
  pressed: 0.6,
};

export const theme = {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadows,
  gradients,
  animations,
  opacity,
};

export type Theme = typeof theme;
