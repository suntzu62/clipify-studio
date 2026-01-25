/**
 * Caption Template Presets
 * Templates pré-configurados de criadores famosos e estilos profissionais
 *
 * ATUALIZADO: 20+ templates inspirados em criadores virais
 */

import { CaptionStyleConfig } from '@/types/caption-templates';

export const PRESET_TEMPLATES: Record<string, CaptionStyleConfig> = {
  // ============================================
  // MRBEAST STYLES
  // ============================================
  mrbeast: {
    font: 'Impact',
    fontSize: 80,
    bold: true,
    italic: false,
    letterSpacing: 0,
    fontColor: '#FFFF00', // Amarelo vibrante
    backgroundColor: '#000000',
    backgroundOpacity: 0.8,
    outline: true,
    outlineColor: '#000000',
    outlineWidth: 8,
    shadow: true,
    shadowColor: '#000000',
    shadowOffsetX: 4,
    shadowOffsetY: 4,
    position: 'center',
    marginBottom: 0,
    marginTop: 0,
    maxCharsPerLine: 25,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FF6B35', // Laranja
    highlightStyle: 'color',
  },

  mrbeastBold: {
    font: 'Impact',
    fontSize: 90,
    bold: true,
    italic: false,
    letterSpacing: 2,
    fontColor: '#FFFF00',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    outline: true,
    outlineColor: '#000000',
    outlineWidth: 12,
    shadow: true,
    shadowColor: '#FF0000',
    shadowOffsetX: 6,
    shadowOffsetY: 6,
    position: 'center',
    marginBottom: 0,
    marginTop: 0,
    maxCharsPerLine: 20,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#00FF00',
    highlightStyle: 'color',
  },

  mrbeastClean: {
    font: 'Bebas Neue',
    fontSize: 85,
    bold: true,
    italic: false,
    letterSpacing: 3,
    fontColor: '#FFFFFF',
    backgroundColor: '#FFFF00',
    backgroundOpacity: 1,
    outline: false,
    shadow: false,
    position: 'center',
    marginBottom: 0,
    marginTop: 0,
    maxCharsPerLine: 22,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FF0000',
    highlightStyle: 'background',
  },

  // ============================================
  // ALEX HORMOZI STYLES
  // ============================================
  alexHormozi: {
    font: 'Montserrat',
    fontSize: 72,
    bold: true,
    italic: false,
    letterSpacing: 2,
    fontColor: '#FFFFFF',
    backgroundColor: '#FF0000', // Vermelho forte
    backgroundOpacity: 1.0,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 100,
    marginTop: 0,
    maxCharsPerLine: 30,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FFD700', // Dourado
    highlightStyle: 'background',
  },

  hormoziBlue: {
    font: 'Montserrat',
    fontSize: 72,
    bold: true,
    italic: false,
    letterSpacing: 2,
    fontColor: '#FFFFFF',
    backgroundColor: '#1E40AF', // Azul forte
    backgroundOpacity: 1.0,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 100,
    marginTop: 0,
    maxCharsPerLine: 30,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FCD34D',
    highlightStyle: 'background',
  },

  hormoziGreen: {
    font: 'Montserrat',
    fontSize: 72,
    bold: true,
    italic: false,
    letterSpacing: 2,
    fontColor: '#FFFFFF',
    backgroundColor: '#059669', // Verde dinheiro
    backgroundOpacity: 1.0,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 100,
    marginTop: 0,
    maxCharsPerLine: 30,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FDE047',
    highlightStyle: 'background',
  },

  hormoziGold: {
    font: 'Montserrat',
    fontSize: 72,
    bold: true,
    italic: false,
    letterSpacing: 2,
    fontColor: '#000000',
    backgroundColor: '#F59E0B', // Dourado
    backgroundOpacity: 1.0,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 100,
    marginTop: 0,
    maxCharsPerLine: 30,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FFFFFF',
    highlightStyle: 'background',
  },

  // ============================================
  // IMAN GADZHI STYLES
  // ============================================
  imanGadzhi: {
    font: 'Arial Black',
    fontSize: 68,
    bold: true,
    italic: false,
    letterSpacing: 1,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    outline: true,
    outlineColor: '#FFD700', // Contorno dourado
    outlineWidth: 5,
    shadow: true,
    shadowColor: '#000000',
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    position: 'bottom',
    marginBottom: 120,
    marginTop: 0,
    maxCharsPerLine: 28,
    textAlign: 'center',
    highlightKeywords: false,
  },

  imanWhite: {
    font: 'Arial Black',
    fontSize: 68,
    bold: true,
    italic: false,
    letterSpacing: 1,
    fontColor: '#1F2937',
    backgroundColor: '#FFFFFF',
    backgroundOpacity: 0.95,
    outline: false,
    shadow: true,
    shadowColor: '#9CA3AF',
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    position: 'bottom',
    marginBottom: 120,
    marginTop: 0,
    maxCharsPerLine: 28,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#F59E0B',
    highlightStyle: 'color',
  },

  // ============================================
  // TECH CREATORS
  // ============================================
  mkbhd: {
    font: 'Inter',
    fontSize: 58,
    bold: true,
    italic: false,
    letterSpacing: 0,
    fontColor: '#FFFFFF',
    backgroundColor: '#18181B',
    backgroundOpacity: 0.85,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 80,
    marginTop: 0,
    maxCharsPerLine: 35,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#EF4444', // Vermelho MKBHD
    highlightStyle: 'color',
  },

  techMinimal: {
    font: 'SF Pro Display',
    fontSize: 54,
    bold: false,
    italic: false,
    letterSpacing: -1,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.6,
    outline: false,
    shadow: true,
    shadowColor: '#000000',
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    position: 'bottom',
    marginBottom: 60,
    marginTop: 0,
    maxCharsPerLine: 40,
    textAlign: 'center',
    highlightKeywords: false,
  },

  // ============================================
  // VLOGGERS & LIFESTYLE
  // ============================================
  caseyNeistat: {
    font: 'Oswald',
    fontSize: 75,
    bold: true,
    italic: false,
    letterSpacing: 4,
    fontColor: '#FFE600', // Amarelo Casey
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    outline: true,
    outlineColor: '#000000',
    outlineWidth: 6,
    shadow: true,
    shadowColor: '#000000',
    shadowOffsetX: 4,
    shadowOffsetY: 4,
    position: 'center',
    marginBottom: 0,
    marginTop: 0,
    maxCharsPerLine: 25,
    textAlign: 'center',
    highlightKeywords: false,
  },

  garyVee: {
    font: 'Impact',
    fontSize: 78,
    bold: true,
    italic: false,
    letterSpacing: 1,
    fontColor: '#FFFFFF',
    backgroundColor: '#DC2626',
    backgroundOpacity: 0.95,
    outline: true,
    outlineColor: '#000000',
    outlineWidth: 3,
    shadow: false,
    position: 'center',
    marginBottom: 0,
    marginTop: 0,
    maxCharsPerLine: 22,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FCD34D',
    highlightStyle: 'color',
  },

  // ============================================
  // PLATFORM-SPECIFIC STYLES
  // ============================================
  tiktokTrending: {
    font: 'Poppins',
    fontSize: 65,
    bold: true,
    italic: false,
    letterSpacing: 0,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    outline: true,
    outlineColor: '#000000',
    outlineWidth: 4,
    shadow: true,
    shadowColor: '#00F2EA', // Cyan TikTok
    shadowOffsetX: 3,
    shadowOffsetY: 3,
    position: 'center',
    marginBottom: 0,
    marginTop: 0,
    maxCharsPerLine: 25,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FF0050', // Rosa TikTok
    highlightStyle: 'color',
  },

  tiktokNeon: {
    font: 'Poppins',
    fontSize: 68,
    bold: true,
    italic: false,
    letterSpacing: 1,
    fontColor: '#00F2EA', // Cyan TikTok
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    outline: true,
    outlineColor: '#FF0050', // Rosa TikTok
    outlineWidth: 4,
    shadow: true,
    shadowColor: '#FF0050',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    position: 'center',
    marginBottom: 0,
    marginTop: 0,
    maxCharsPerLine: 22,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FFFFFF',
    highlightStyle: 'color',
  },

  instagramGlow: {
    font: 'Montserrat',
    fontSize: 62,
    bold: true,
    italic: false,
    letterSpacing: 1,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    outline: false,
    shadow: true,
    shadowColor: '#E1306C', // Rosa Instagram
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    position: 'center',
    marginBottom: 0,
    marginTop: 0,
    maxCharsPerLine: 28,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#F77737', // Laranja Instagram
    highlightStyle: 'color',
  },

  instagramClean: {
    font: 'Helvetica Neue',
    fontSize: 56,
    bold: true,
    italic: false,
    letterSpacing: 0,
    fontColor: '#262626',
    backgroundColor: '#FFFFFF',
    backgroundOpacity: 0.95,
    outline: false,
    shadow: true,
    shadowColor: '#00000020',
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    position: 'bottom',
    marginBottom: 100,
    marginTop: 0,
    maxCharsPerLine: 32,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#0095F6', // Azul Instagram
    highlightStyle: 'color',
  },

  youtubeShortsPop: {
    font: 'Roboto',
    fontSize: 70,
    bold: true,
    italic: false,
    letterSpacing: 0,
    fontColor: '#FFFFFF',
    backgroundColor: '#FF0000', // Vermelho YouTube
    backgroundOpacity: 0.9,
    outline: true,
    outlineColor: '#000000',
    outlineWidth: 3,
    shadow: false,
    position: 'bottom',
    marginBottom: 120,
    marginTop: 0,
    maxCharsPerLine: 26,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FFFF00',
    highlightStyle: 'color',
  },

  // ============================================
  // PODCAST & TALK SHOWS
  // ============================================
  podcastClean: {
    font: 'Inter',
    fontSize: 52,
    bold: false,
    italic: false,
    letterSpacing: 0,
    fontColor: '#FFFFFF',
    backgroundColor: '#1F2937',
    backgroundOpacity: 0.9,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 60,
    marginTop: 0,
    maxCharsPerLine: 45,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#60A5FA',
    highlightStyle: 'color',
  },

  podcastBold: {
    font: 'Poppins',
    fontSize: 60,
    bold: true,
    italic: false,
    letterSpacing: 0,
    fontColor: '#FFFFFF',
    backgroundColor: '#7C3AED', // Roxo
    backgroundOpacity: 0.95,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 80,
    marginTop: 0,
    maxCharsPerLine: 38,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FCD34D',
    highlightStyle: 'background',
  },

  joRogan: {
    font: 'Arial',
    fontSize: 58,
    bold: true,
    italic: false,
    letterSpacing: 0,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.85,
    outline: false,
    shadow: true,
    shadowColor: '#059669',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    position: 'bottom',
    marginBottom: 80,
    marginTop: 0,
    maxCharsPerLine: 40,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#10B981', // Verde JRE
    highlightStyle: 'color',
  },

  // ============================================
  // NEWS & DOCUMENTARY
  // ============================================
  newsDocumentary: {
    font: 'Georgia',
    fontSize: 54,
    bold: false,
    italic: false,
    letterSpacing: 0,
    fontColor: '#FFFFFF',
    backgroundColor: '#1E3A8A',
    backgroundOpacity: 0.95,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 40,
    marginTop: 0,
    maxCharsPerLine: 50,
    textAlign: 'center',
    highlightKeywords: false,
  },

  breakingNews: {
    font: 'Roboto Condensed',
    fontSize: 64,
    bold: true,
    italic: false,
    letterSpacing: 1,
    fontColor: '#FFFFFF',
    backgroundColor: '#DC2626',
    backgroundOpacity: 1,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 40,
    marginTop: 0,
    maxCharsPerLine: 40,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FEF08A',
    highlightStyle: 'color',
  },

  cinematic: {
    font: 'Cinzel',
    fontSize: 50,
    bold: false,
    italic: false,
    letterSpacing: 4,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    outline: false,
    shadow: true,
    shadowColor: '#000000',
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    position: 'bottom',
    marginBottom: 60,
    marginTop: 0,
    maxCharsPerLine: 50,
    textAlign: 'center',
    highlightKeywords: false,
  },

  // ============================================
  // KARAOKE & MUSIC
  // ============================================
  karaokeNeon: {
    font: 'Bebas Neue',
    fontSize: 80,
    bold: true,
    italic: false,
    letterSpacing: 3,
    fontColor: '#00FFFF', // Cyan
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    outline: true,
    outlineColor: '#FF00FF', // Magenta
    outlineWidth: 4,
    shadow: true,
    shadowColor: '#FF00FF',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    position: 'center',
    marginBottom: 0,
    marginTop: 0,
    maxCharsPerLine: 20,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FFFF00',
    highlightStyle: 'color',
  },

  karaokeClassic: {
    font: 'Arial Black',
    fontSize: 72,
    bold: true,
    italic: false,
    letterSpacing: 1,
    fontColor: '#FFFFFF',
    backgroundColor: '#000080', // Navy
    backgroundOpacity: 0.8,
    outline: true,
    outlineColor: '#000000',
    outlineWidth: 3,
    shadow: false,
    position: 'bottom',
    marginBottom: 100,
    marginTop: 0,
    maxCharsPerLine: 30,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#00BFFF',
    highlightStyle: 'background',
  },

  // ============================================
  // MINIMAL & CLEAN STYLES
  // ============================================
  minimal: {
    font: 'Helvetica',
    fontSize: 56,
    bold: false,
    italic: false,
    letterSpacing: 0,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.5,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 80,
    marginTop: 0,
    maxCharsPerLine: 35,
    textAlign: 'center',
    highlightKeywords: false,
  },

  subtleElegant: {
    font: 'Playfair Display',
    fontSize: 52,
    bold: false,
    italic: true,
    letterSpacing: 1,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.4,
    outline: false,
    shadow: true,
    shadowColor: '#00000080',
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    position: 'bottom',
    marginBottom: 60,
    marginTop: 0,
    maxCharsPerLine: 40,
    textAlign: 'center',
    highlightKeywords: false,
  },

  modernSans: {
    font: 'DM Sans',
    fontSize: 58,
    bold: true,
    italic: false,
    letterSpacing: -1,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.7,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 80,
    marginTop: 0,
    maxCharsPerLine: 35,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#A78BFA',
    highlightStyle: 'color',
  },

  // ============================================
  // PROFESSIONAL STYLES
  // ============================================
  professional: {
    font: 'Arial',
    fontSize: 60,
    bold: true,
    italic: false,
    letterSpacing: 0,
    fontColor: '#FFFFFF',
    backgroundColor: '#1E3A8A', // Azul profissional
    backgroundOpacity: 0.9,
    outline: false,
    shadow: true,
    shadowColor: '#000000',
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    position: 'bottom',
    marginBottom: 60,
    marginTop: 0,
    maxCharsPerLine: 40,
    textAlign: 'center',
    highlightKeywords: false,
  },

  corporate: {
    font: 'Open Sans',
    fontSize: 54,
    bold: true,
    italic: false,
    letterSpacing: 0,
    fontColor: '#FFFFFF',
    backgroundColor: '#0F172A',
    backgroundOpacity: 0.9,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 50,
    marginTop: 0,
    maxCharsPerLine: 45,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#3B82F6',
    highlightStyle: 'color',
  },

  startup: {
    font: 'Inter',
    fontSize: 56,
    bold: true,
    italic: false,
    letterSpacing: -1,
    fontColor: '#FFFFFF',
    backgroundColor: '#6366F1', // Indigo
    backgroundOpacity: 0.95,
    outline: false,
    shadow: false,
    position: 'bottom',
    marginBottom: 80,
    marginTop: 0,
    maxCharsPerLine: 35,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FCD34D',
    highlightStyle: 'background',
  },

  // ============================================
  // GAMING STYLES
  // ============================================
  gaming: {
    font: 'Orbitron',
    fontSize: 65,
    bold: true,
    italic: false,
    letterSpacing: 2,
    fontColor: '#00FF00', // Verde neon
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    outline: true,
    outlineColor: '#000000',
    outlineWidth: 4,
    shadow: true,
    shadowColor: '#00FF00',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    position: 'center',
    marginBottom: 0,
    marginTop: 0,
    maxCharsPerLine: 25,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FF0000',
    highlightStyle: 'color',
  },

  esports: {
    font: 'Rajdhani',
    fontSize: 68,
    bold: true,
    italic: false,
    letterSpacing: 3,
    fontColor: '#FFFFFF',
    backgroundColor: '#7C3AED',
    backgroundOpacity: 0.9,
    outline: true,
    outlineColor: '#000000',
    outlineWidth: 2,
    shadow: false,
    position: 'bottom',
    marginBottom: 100,
    marginTop: 0,
    maxCharsPerLine: 28,
    textAlign: 'center',
    highlightKeywords: true,
    highlightColor: '#FBBF24',
    highlightStyle: 'color',
  },

  // ============================================
  // DEFAULT
  // ============================================
  default: {
    font: 'Arial',
    fontSize: 60,
    bold: true,
    italic: false,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.7,
    outline: true,
    outlineColor: '#000000',
    outlineWidth: 3,
    shadow: false,
    position: 'bottom',
    marginBottom: 60,
    textAlign: 'center',
    highlightKeywords: false,
  },
};

/**
 * Metadata dos templates para exibição na UI
 */
export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  creator: string;
  category: 'creator' | 'professional' | 'minimal' | 'platform' | 'entertainment';
  isPremium: boolean;
  previewImage?: string;
  tags?: string[];
}

export const TEMPLATE_METADATA: Record<string, TemplateMetadata> = {
  // MrBeast Styles
  mrbeast: {
    id: 'template_mrbeast',
    name: 'MrBeast Classic',
    description: 'Legendas amarelas vibrantes com destaque laranja, perfeitas para conteúdo de alto impacto',
    creator: 'MrBeast',
    category: 'creator',
    isPremium: false,
    tags: ['viral', 'youtube', 'impacto'],
  },
  mrbeastBold: {
    id: 'template_mrbeast_bold',
    name: 'MrBeast Bold',
    description: 'Versão mais agressiva com sombra vermelha e outline grosso para máximo impacto',
    creator: 'MrBeast',
    category: 'creator',
    isPremium: false,
    tags: ['viral', 'youtube', 'bold'],
  },
  mrbeastClean: {
    id: 'template_mrbeast_clean',
    name: 'MrBeast Clean',
    description: 'Fundo amarelo sólido com texto branco, look limpo e moderno',
    creator: 'MrBeast',
    category: 'creator',
    isPremium: false,
    tags: ['viral', 'clean', 'moderno'],
  },

  // Hormozi Styles
  alexHormozi: {
    id: 'template_hormozi',
    name: 'Hormozi Red',
    description: 'Fundo vermelho sólido com texto branco em negrito, ideal para conteúdo educacional e vendas',
    creator: 'Alex Hormozi',
    category: 'creator',
    isPremium: false,
    tags: ['business', 'educacional', 'vendas'],
  },
  hormoziBlue: {
    id: 'template_hormozi_blue',
    name: 'Hormozi Blue',
    description: 'Versão azul profissional, perfeita para conteúdo corporativo e confiável',
    creator: 'Alex Hormozi',
    category: 'creator',
    isPremium: false,
    tags: ['business', 'profissional', 'confiança'],
  },
  hormoziGreen: {
    id: 'template_hormozi_green',
    name: 'Hormozi Money',
    description: 'Verde dinheiro que transmite prosperidade e sucesso financeiro',
    creator: 'Alex Hormozi',
    category: 'creator',
    isPremium: false,
    tags: ['business', 'dinheiro', 'sucesso'],
  },
  hormoziGold: {
    id: 'template_hormozi_gold',
    name: 'Hormozi Gold',
    description: 'Fundo dourado luxuoso com texto preto, ideal para conteúdo premium',
    creator: 'Alex Hormozi',
    category: 'creator',
    isPremium: false,
    tags: ['business', 'luxo', 'premium'],
  },

  // Iman Gadzhi Styles
  imanGadzhi: {
    id: 'template_gadzhi',
    name: 'Iman Gadzhi Gold',
    description: 'Texto branco com contorno dourado elegante, perfeito para conteúdo de lifestyle e negócios',
    creator: 'Iman Gadzhi',
    category: 'creator',
    isPremium: false,
    tags: ['lifestyle', 'luxury', 'business'],
  },
  imanWhite: {
    id: 'template_gadzhi_white',
    name: 'Iman Clean White',
    description: 'Fundo branco minimalista com texto escuro, visual clean e sofisticado',
    creator: 'Iman Gadzhi',
    category: 'creator',
    isPremium: false,
    tags: ['lifestyle', 'clean', 'minimal'],
  },

  // Tech Creators
  mkbhd: {
    id: 'template_mkbhd',
    name: 'MKBHD Tech',
    description: 'Estilo clean de tech review com destaque vermelho signature do Marques Brownlee',
    creator: 'MKBHD',
    category: 'creator',
    isPremium: false,
    tags: ['tech', 'review', 'clean'],
  },
  techMinimal: {
    id: 'template_tech_minimal',
    name: 'Tech Minimal',
    description: 'Estilo Apple-like minimalista para conteúdo de tecnologia',
    creator: 'Clipify',
    category: 'professional',
    isPremium: false,
    tags: ['tech', 'minimal', 'apple'],
  },

  // Vloggers
  caseyNeistat: {
    id: 'template_casey',
    name: 'Casey Neistat',
    description: 'Amarelo bold em caps com outline forte, energia de vlog de NYC',
    creator: 'Casey Neistat',
    category: 'creator',
    isPremium: false,
    tags: ['vlog', 'nyc', 'energia'],
  },
  garyVee: {
    id: 'template_garyvee',
    name: 'Gary Vee Energy',
    description: 'Vermelho energético com texto branco bold, para conteúdo motivacional intenso',
    creator: 'Gary Vaynerchuk',
    category: 'creator',
    isPremium: false,
    tags: ['motivacional', 'energia', 'hustle'],
  },

  // Platform Specific
  tiktokTrending: {
    id: 'template_tiktok_trending',
    name: 'TikTok Trending',
    description: 'Cores e estilo trending no TikTok com sombra cyan e highlight rosa',
    creator: 'Clipify',
    category: 'platform',
    isPremium: false,
    tags: ['tiktok', 'trending', 'viral'],
  },
  tiktokNeon: {
    id: 'template_tiktok_neon',
    name: 'TikTok Neon',
    description: 'Visual neon vibrante nas cores oficiais do TikTok',
    creator: 'Clipify',
    category: 'platform',
    isPremium: false,
    tags: ['tiktok', 'neon', 'noite'],
  },
  instagramGlow: {
    id: 'template_instagram_glow',
    name: 'Instagram Glow',
    description: 'Efeito glow nas cores gradiente do Instagram',
    creator: 'Clipify',
    category: 'platform',
    isPremium: false,
    tags: ['instagram', 'reels', 'glow'],
  },
  instagramClean: {
    id: 'template_instagram_clean',
    name: 'Instagram Clean',
    description: 'Estilo limpo e moderno do feed do Instagram',
    creator: 'Clipify',
    category: 'platform',
    isPremium: false,
    tags: ['instagram', 'clean', 'feed'],
  },
  youtubeShortsPop: {
    id: 'template_youtube_shorts',
    name: 'YouTube Shorts Pop',
    description: 'Vermelho YouTube com pop visual para Shorts',
    creator: 'Clipify',
    category: 'platform',
    isPremium: false,
    tags: ['youtube', 'shorts', 'pop'],
  },

  // Podcast Styles
  podcastClean: {
    id: 'template_podcast_clean',
    name: 'Podcast Clean',
    description: 'Estilo limpo para clips de podcast, fácil de ler',
    creator: 'Clipify',
    category: 'professional',
    isPremium: false,
    tags: ['podcast', 'clean', 'leitura'],
  },
  podcastBold: {
    id: 'template_podcast_bold',
    name: 'Podcast Bold',
    description: 'Estilo bold roxo para highlights de podcast',
    creator: 'Clipify',
    category: 'professional',
    isPremium: false,
    tags: ['podcast', 'bold', 'highlight'],
  },
  joRogan: {
    id: 'template_jre',
    name: 'JRE Style',
    description: 'Inspirado no Joe Rogan Experience com glow verde',
    creator: 'Joe Rogan',
    category: 'creator',
    isPremium: false,
    tags: ['podcast', 'jre', 'conversas'],
  },

  // News & Documentary
  newsDocumentary: {
    id: 'template_news',
    name: 'News Documentary',
    description: 'Estilo de noticiário/documentário profissional',
    creator: 'Clipify',
    category: 'professional',
    isPremium: false,
    tags: ['news', 'documentary', 'profissional'],
  },
  breakingNews: {
    id: 'template_breaking',
    name: 'Breaking News',
    description: 'Estilo urgente de notícia de última hora',
    creator: 'Clipify',
    category: 'professional',
    isPremium: false,
    tags: ['news', 'urgente', 'alerta'],
  },
  cinematic: {
    id: 'template_cinematic',
    name: 'Cinematic',
    description: 'Legendas estilo cinema com tipografia clássica',
    creator: 'Clipify',
    category: 'professional',
    isPremium: false,
    tags: ['cinema', 'filme', 'clássico'],
  },

  // Karaoke & Music
  karaokeNeon: {
    id: 'template_karaoke_neon',
    name: 'Karaoke Neon',
    description: 'Visual neon vibrante para vídeos de música',
    creator: 'Clipify',
    category: 'entertainment',
    isPremium: false,
    tags: ['karaoke', 'música', 'neon'],
  },
  karaokeClassic: {
    id: 'template_karaoke_classic',
    name: 'Karaoke Classic',
    description: 'Estilo clássico de karaoke com fundo azul',
    creator: 'Clipify',
    category: 'entertainment',
    isPremium: false,
    tags: ['karaoke', 'música', 'clássico'],
  },

  // Minimal & Clean
  minimal: {
    id: 'template_minimal',
    name: 'Minimal Clean',
    description: 'Design minimalista e discreto, ideal para conteúdo profissional',
    creator: 'Clipify',
    category: 'minimal',
    isPremium: false,
    tags: ['minimal', 'clean', 'discreto'],
  },
  subtleElegant: {
    id: 'template_subtle',
    name: 'Subtle Elegant',
    description: 'Elegante e sutil com fonte serifada itálica',
    creator: 'Clipify',
    category: 'minimal',
    isPremium: false,
    tags: ['elegante', 'sutil', 'sofisticado'],
  },
  modernSans: {
    id: 'template_modern_sans',
    name: 'Modern Sans',
    description: 'Tipografia moderna sans-serif com toque roxo',
    creator: 'Clipify',
    category: 'minimal',
    isPremium: false,
    tags: ['moderno', 'clean', 'atual'],
  },

  // Professional
  professional: {
    id: 'template_professional',
    name: 'Professional Blue',
    description: 'Estilo corporativo com fundo azul profissional',
    creator: 'Clipify',
    category: 'professional',
    isPremium: false,
    tags: ['corporativo', 'profissional', 'formal'],
  },
  corporate: {
    id: 'template_corporate',
    name: 'Corporate Dark',
    description: 'Visual escuro e sério para apresentações corporativas',
    creator: 'Clipify',
    category: 'professional',
    isPremium: false,
    tags: ['corporativo', 'escuro', 'sério'],
  },
  startup: {
    id: 'template_startup',
    name: 'Startup Vibe',
    description: 'Visual moderno de startup com cores vibrantes',
    creator: 'Clipify',
    category: 'professional',
    isPremium: false,
    tags: ['startup', 'moderno', 'tech'],
  },

  // Gaming
  gaming: {
    id: 'template_gaming',
    name: 'Gaming Neon',
    description: 'Visual gamer com verde neon e efeito de glow',
    creator: 'Clipify',
    category: 'entertainment',
    isPremium: false,
    tags: ['gaming', 'neon', 'stream'],
  },
  esports: {
    id: 'template_esports',
    name: 'Esports Pro',
    description: 'Estilo profissional de esports com roxo e dourado',
    creator: 'Clipify',
    category: 'entertainment',
    isPremium: false,
    tags: ['esports', 'pro', 'competitivo'],
  },
};

/**
 * Agrupa templates por categoria para facilitar navegação
 */
export const TEMPLATES_BY_CATEGORY = {
  creator: ['mrbeast', 'mrbeastBold', 'mrbeastClean', 'alexHormozi', 'hormoziBlue', 'hormoziGreen', 'hormoziGold', 'imanGadzhi', 'imanWhite', 'mkbhd', 'caseyNeistat', 'garyVee', 'joRogan'],
  platform: ['tiktokTrending', 'tiktokNeon', 'instagramGlow', 'instagramClean', 'youtubeShortsPop'],
  professional: ['professional', 'corporate', 'startup', 'techMinimal', 'podcastClean', 'podcastBold', 'newsDocumentary', 'breakingNews', 'cinematic'],
  minimal: ['minimal', 'subtleElegant', 'modernSans'],
  entertainment: ['karaokeNeon', 'karaokeClassic', 'gaming', 'esports'],
};

/**
 * Lista de templates populares/recomendados
 */
export const POPULAR_TEMPLATES = [
  'mrbeast',
  'alexHormozi',
  'tiktokTrending',
  'instagramGlow',
  'minimal',
  'podcastClean',
];

/**
 * Helper para obter template por ID
 */
export function getTemplateById(id: string): CaptionStyleConfig | undefined {
  return PRESET_TEMPLATES[id];
}

/**
 * Helper para obter metadata por ID
 */
export function getTemplateMetadata(id: string): TemplateMetadata | undefined {
  return TEMPLATE_METADATA[id];
}

/**
 * Retorna todos os templates de uma categoria
 */
export function getTemplatesByCategory(category: keyof typeof TEMPLATES_BY_CATEGORY): Array<{ id: string; config: CaptionStyleConfig; metadata: TemplateMetadata }> {
  const ids = TEMPLATES_BY_CATEGORY[category] || [];
  return ids.map(id => ({
    id,
    config: PRESET_TEMPLATES[id],
    metadata: TEMPLATE_METADATA[id],
  })).filter(t => t.config && t.metadata);
}
