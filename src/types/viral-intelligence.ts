/**
 * Sistema de Inteligência Viral - Exclusivo do Cortai
 * Análise preditiva e recomendações acionáveis para maximizar alcance
 */

export type PlatformType = 'tiktok' | 'instagram' | 'youtube' | 'all';

export interface PlatformPrediction {
  platform: PlatformType;
  viralScore: number; // 0-100
  confidence: 'high' | 'medium' | 'low';
  reason: string; // Ex: "Formato perfeito para TikTok - alta retenção nos primeiros 3s"
  bestPostingTime?: string; // Ex: "19:00-21:00 (Horário de pico)"
  estimatedReach?: {
    min: number;
    max: number;
    unit: 'views' | 'impressions';
  };
}

export interface ViralInsight {
  type: 'strength' | 'opportunity' | 'warning';
  icon: string;
  title: string;
  description: string;
  actionable?: string; // Dica acionável
}

export interface ContentAnalysis {
  pacing: 'fast' | 'moderate' | 'slow';
  emotion: 'exciting' | 'calm' | 'dramatic' | 'funny' | 'inspiring';
  audienceRetention: number; // 0-100
  keyMoments: Array<{
    timestamp: number;
    description: string;
    importance: 'high' | 'medium' | 'low';
  }>;
}

export interface ViralIntelligence {
  // Score geral de potencial viral
  overallScore: number; // 0-100

  // Previsões específicas por plataforma
  platformPredictions: PlatformPrediction[];

  // Melhor plataforma recomendada
  recommendedPlatform: PlatformType;

  // Insights acionáveis (3-5 insights principais)
  insights: ViralInsight[];

  // Análise de conteúdo
  contentAnalysis: ContentAnalysis;

  // Comparação com outros clipes do mesmo projeto
  ranking?: {
    position: number;
    total: number;
    percentile: number; // Ex: top 20%
  };

  // Tags de categoria automáticas
  autoTags: string[]; // Ex: ["educational", "fast-paced", "trending-topic"]
}

/**
 * Função para gerar Inteligência Viral baseado em análise do clipe
 * (Mock inicial - pode ser substituído por análise real de IA)
 */
export function generateViralIntelligence(clip: {
  title: string;
  description: string;
  hashtags: string[];
  duration: number;
  transcript?: Array<{ text: string; start: number; end: number }>;
}): ViralIntelligence {
  // Score base entre 70-98 para dar sensação de qualidade
  const baseScore = 70 + Math.floor(Math.random() * 28);

  // Análise de duração (clipes entre 15-45s são ideais)
  const durationScore = clip.duration >= 15 && clip.duration <= 45 ? 95 : 75;

  // Análise de título (clickbait words)
  const clickbaitWords = ['incrível', 'chocante', 'segredo', 'nunca', 'sempre', 'melhor'];
  const hasClickbait = clickbaitWords.some(word =>
    clip.title.toLowerCase().includes(word)
  );

  // Análise de hashtags
  const hasHashtags = clip.hashtags.length >= 3;

  // Score final
  const overallScore = Math.min(98, Math.floor(
    baseScore * 0.6 +
    durationScore * 0.2 +
    (hasClickbait ? 10 : 0) +
    (hasHashtags ? 5 : 0)
  ));

  // Determinar emoção baseado no título e descrição
  const text = `${clip.title} ${clip.description}`.toLowerCase();
  let emotion: ContentAnalysis['emotion'] = 'inspiring';
  if (text.match(/engraçado|hilário|rir|piada/)) emotion = 'funny';
  else if (text.match(/incrível|chocante|uau|surpreend/)) emotion = 'exciting';
  else if (text.match(/calm|relax|paz|tranquil/)) emotion = 'calm';
  else if (text.match(/drama|tensão|suspense/)) emotion = 'dramatic';

  // Determinar ritmo baseado na duração
  const pacing: ContentAnalysis['pacing'] =
    clip.duration < 20 ? 'fast' :
    clip.duration < 40 ? 'moderate' : 'slow';

  // Predictions por plataforma
  const tiktokScore = Math.min(98, overallScore + (clip.duration <= 30 ? 5 : -5));
  const instagramScore = Math.min(98, overallScore + (hasHashtags ? 3 : -2));
  const youtubeScore = Math.min(98, overallScore + (clip.duration >= 30 ? 3 : -3));

  const platformPredictions: PlatformPrediction[] = [
    {
      platform: 'tiktok',
      viralScore: tiktokScore,
      confidence: tiktokScore >= 85 ? 'high' : tiktokScore >= 75 ? 'medium' : 'low',
      reason: clip.duration <= 30
        ? 'Duração perfeita para TikTok - alta probabilidade de retenção completa'
        : 'Bom conteúdo, mas considere versão mais curta para TikTok',
      bestPostingTime: '18:00-21:00 (Horário de pico)',
      estimatedReach: {
        min: tiktokScore >= 85 ? 10000 : 5000,
        max: tiktokScore >= 85 ? 100000 : 50000,
        unit: 'views'
      }
    },
    {
      platform: 'instagram',
      viralScore: instagramScore,
      confidence: instagramScore >= 85 ? 'high' : instagramScore >= 75 ? 'medium' : 'low',
      reason: hasHashtags
        ? 'Hashtags estratégicas aumentam descoberta no Instagram'
        : 'Adicione mais hashtags relevantes para melhor alcance',
      bestPostingTime: '12:00-13:00, 19:00-21:00',
      estimatedReach: {
        min: instagramScore >= 85 ? 8000 : 3000,
        max: instagramScore >= 85 ? 80000 : 40000,
        unit: 'views'
      }
    },
    {
      platform: 'youtube',
      viralScore: youtubeScore,
      confidence: youtubeScore >= 85 ? 'high' : youtubeScore >= 75 ? 'medium' : 'low',
      reason: clip.duration >= 30
        ? 'Duração ideal para YouTube Shorts'
        : 'YouTube Shorts permite vídeos mais longos - considere versão estendida',
      bestPostingTime: '15:00-18:00',
      estimatedReach: {
        min: youtubeScore >= 85 ? 15000 : 5000,
        max: youtubeScore >= 85 ? 150000 : 60000,
        unit: 'views'
      }
    }
  ];

  // Determinar melhor plataforma
  const bestPlatform = platformPredictions.reduce((best, current) =>
    current.viralScore > best.viralScore ? current : best
  );

  // Gerar insights acionáveis
  const insights: ViralInsight[] = [];

  // Insight sobre hook
  if (clip.duration <= 60) {
    insights.push({
      type: 'strength',
      icon: '🎯',
      title: 'Hook Forte',
      description: 'Duração otimizada para prender atenção',
      actionable: 'Mantenha as primeiras 3 segundos impactantes'
    });
  }

  // Insight sobre hashtags
  if (hasHashtags) {
    insights.push({
      type: 'strength',
      icon: '#️⃣',
      title: 'Hashtags Estratégicas',
      description: `${clip.hashtags.length} hashtags relevantes para alcance`,
      actionable: 'Considere adicionar trending hashtags'
    });
  } else {
    insights.push({
      type: 'opportunity',
      icon: '📈',
      title: 'Adicione Hashtags',
      description: 'Aumente descoberta com hashtags relevantes',
      actionable: 'Sugestão: adicione 5-10 hashtags relacionadas ao nicho'
    });
  }

  // Insight sobre título
  if (hasClickbait || clip.title.length > 30) {
    insights.push({
      type: 'strength',
      icon: '✨',
      title: 'Título Chamativo',
      description: 'Título otimizado para cliques',
      actionable: 'Teste variações A/B do título'
    });
  }

  // Insight sobre timing de postagem
  insights.push({
    type: 'opportunity',
    icon: '⏰',
    title: 'Timing Estratégico',
    description: `Melhor horário: ${bestPlatform.bestPostingTime}`,
    actionable: 'Agende postagem para horário de pico'
  });

  // Insight sobre engagement
  if (emotion === 'funny' || emotion === 'exciting') {
    insights.push({
      type: 'strength',
      icon: '🔥',
      title: 'Alto Potencial de Engajamento',
      description: `Conteúdo ${emotion === 'funny' ? 'divertido' : 'emocionante'} gera mais compartilhamentos`,
      actionable: 'Incentive comentários com pergunta no final'
    });
  }

  return {
    overallScore,
    platformPredictions,
    recommendedPlatform: bestPlatform.platform,
    insights: insights.slice(0, 5), // Máximo 5 insights
    contentAnalysis: {
      pacing,
      emotion,
      audienceRetention: Math.floor(75 + Math.random() * 20), // 75-95%
      keyMoments: [] // Pode ser expandido com análise de transcript
    },
    autoTags: [
      pacing,
      emotion,
      clip.duration <= 30 ? 'short-form' : 'medium-form',
      overallScore >= 85 ? 'high-potential' : 'good-potential'
    ]
  };
}
