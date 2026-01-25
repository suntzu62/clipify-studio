/**
 * Caption Templates - Tipos TypeScript
 * Sistema de templates de legendas estilo criadores famosos (MrBeast, Alex Hormozi, etc.)
 */

export type TemplateCategory = 'creator' | 'professional' | 'minimal' | 'custom' | 'platform' | 'entertainment';

export type CaptionPosition = 'top' | 'center' | 'bottom';

export type TextAlign = 'left' | 'center' | 'right';

export type HighlightStyle = 'color' | 'bold' | 'background';

/**
 * Configuração de estilo de legenda
 */
export interface CaptionStyleConfig {
  // Fonte
  font: string; // "Impact", "Montserrat Black", "Arial Black", etc.
  fontSize: number; // 48-120
  bold: boolean;
  italic: boolean;
  letterSpacing?: number; // -2 a 5

  // Cores
  fontColor: string; // "#FFFFFF"
  backgroundColor: string; // "#000000"
  backgroundOpacity: number; // 0-1

  // Efeitos
  outline: boolean;
  outlineColor?: string;
  outlineWidth?: number; // 0-10
  shadow: boolean;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;

  // Posicionamento
  position: CaptionPosition;
  marginBottom?: number; // pixels
  marginTop?: number; // pixels
  maxCharsPerLine?: number; // 15-40
  textAlign: TextAlign;

  // Destaque de palavras-chave
  highlightKeywords?: boolean;
  highlightColor?: string; // "#FF6B35"
  highlightStyle?: HighlightStyle;
}

/**
 * Template de legenda completo
 */
export interface CaptionTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  isPremium: boolean;
  isPublic: boolean;
  createdBy?: string;
  thumbnailUrl?: string;
  useCount: number;
  styleConfig: CaptionStyleConfig;
  createdAt: string;
  updatedAt: string;
}

/**
 * Dados para criar um novo template
 */
export interface CreateTemplateInput {
  name: string;
  category: TemplateCategory;
  isPublic?: boolean;
  styleConfig: CaptionStyleConfig;
}

/**
 * Dados para atualizar um template
 */
export interface UpdateTemplateInput {
  name?: string;
  styleConfig?: Partial<CaptionStyleConfig>;
}
