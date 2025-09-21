import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface BrollSuggestion {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  duration: number;
  relevanceScore: number;
  source: 'internal' | 'pexels' | 'pixabay';
  keywords: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface SearchOptions {
  clipId?: string;
  minScore?: number;
  sources?: string[];
}

export const useBrollStock = () => {
  const [suggestions, setSuggestions] = useState<BrollSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const calculateRelevanceScore = useCallback((keywords: string[], searchTerms: string[]) => {
    if (!keywords.length || !searchTerms.length) return 0;

    const matchCount = keywords.filter(keyword => 
      searchTerms.some(term => 
        keyword.toLowerCase().includes(term.toLowerCase()) ||
        term.toLowerCase().includes(keyword.toLowerCase())
      )
    ).length;

    return Math.round((matchCount / Math.max(keywords.length, searchTerms.length)) * 100);
  }, []);

  const generateMockSuggestions = useCallback((searchTerms: string[]): BrollSuggestion[] => {
    // Mock data for demonstration - in production this would call actual APIs
    const mockData = [
      {
        id: '1',
        url: 'https://example.com/video1.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=225&fit=crop',
        title: 'Professional Business Meeting',
        duration: 15,
        keywords: ['business', 'meeting', 'professional', 'office'],
        source: 'pexels' as const
      },
      {
        id: '2',
        url: 'https://example.com/video2.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=400&h=225&fit=crop',
        title: 'Technology and Innovation',
        duration: 12,
        keywords: ['technology', 'computer', 'innovation', 'digital'],
        source: 'pixabay' as const
      },
      {
        id: '3',
        url: 'https://example.com/video3.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=225&fit=crop',
        title: 'Data Analytics Dashboard',
        duration: 8,
        keywords: ['data', 'analytics', 'chart', 'business'],
        source: 'internal' as const
      },
      {
        id: '4',
        url: 'https://example.com/video4.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=400&h=225&fit=crop',
        title: 'Creative Team Collaboration',
        duration: 20,
        keywords: ['team', 'collaboration', 'creative', 'workshop'],
        source: 'pexels' as const
      },
      {
        id: '5',
        url: 'https://example.com/video5.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=225&fit=crop',
        title: 'Digital Marketing Strategy',
        duration: 18,
        keywords: ['marketing', 'digital', 'strategy', 'growth'],
        source: 'pixabay' as const
      }
    ];

    return mockData.map(item => {
      const relevanceScore = calculateRelevanceScore(item.keywords, searchTerms);
      
      return {
        ...item,
      relevanceScore,
      confidence: (relevanceScore >= 70 ? 'high' : relevanceScore >= 40 ? 'medium' : 'low') as 'high' | 'medium' | 'low'
      };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }, [calculateRelevanceScore]);

  const searchBroll = useCallback(async (query: string, options: SearchOptions = {}) => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
      const mockSuggestions = generateMockSuggestions(searchTerms);
      
      // Filter by minimum score
      const filteredSuggestions = mockSuggestions.filter(
        suggestion => suggestion.relevanceScore >= (options.minScore || 30)
      );

      setSuggestions(filteredSuggestions);

      if (filteredSuggestions.length === 0) {
        toast({
          title: "Nenhuma sugestão encontrada",
          description: "Tente termos mais específicos ou genéricos",
          variant: "destructive"
        });
      }

    } catch (err) {
      setError('Erro ao buscar sugestões de B-roll');
      toast({
        title: "Erro na busca",
        description: "Não foi possível buscar sugestões no momento",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [generateMockSuggestions, toast]);

  const refreshSuggestions = useCallback(async (clipId?: string) => {
    setLoading(true);
    
    try {
      // Simulate refresh with different results
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const refreshedSuggestions = generateMockSuggestions(['business', 'technology', 'innovation']);
      setSuggestions(refreshedSuggestions);
      
    } catch (err) {
      setError('Erro ao atualizar sugestões');
    } finally {
      setLoading(false);
    }
  }, [generateMockSuggestions]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setError(null);
  }, []);

  return {
    suggestions,
    loading,
    error,
    searchBroll,
    refreshSuggestions,
    clearSuggestions
  };
};