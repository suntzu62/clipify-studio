import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Video, 
  Search, 
  ThumbsUp, 
  ThumbsDown, 
  Eye, 
  Sparkles,
  Zap,
  Clock,
  Star
} from 'lucide-react';
import { useBrollStock } from '@/hooks/useBrollStock';
import { useToast } from '@/hooks/use-toast';
import { Clip } from '@/hooks/useClipList';
import posthog from 'posthog-js';

interface BrollPanelProps {
  clip: Clip;
  onApply?: (brollData: BrollSelection[]) => void;
}

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

interface BrollSelection {
  suggestionId: string;
  startTime: number;
  duration: number;
  opacity: number;
  position: 'overlay' | 'picture-in-picture' | 'split-screen';
}

export const BrollPanel = ({ clip, onApply }: BrollPanelProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSuggestions, setSelectedSuggestions] = useState<BrollSelection[]>([]);
  const [previewSuggestion, setPreviewSuggestion] = useState<string | null>(null);
  
  const {
    suggestions,
    loading,
    searchBroll,
    refreshSuggestions
  } = useBrollStock();

  const { toast } = useToast();

  useEffect(() => {
    // Auto-generate suggestions based on transcript
    if (clip.transcript && clip.transcript.length > 0) {
      const keywords = extractKeywords(clip.transcript);
      searchBroll(keywords.join(' '), { clipId: clip.id });
    }
    
    posthog.capture('broll_panel_open', { clipId: clip.id });
  }, [clip.id, clip.transcript]);

  const extractKeywords = (transcript: any[]) => {
    // Simple keyword extraction from transcript
    const text = transcript.map(seg => seg.text).join(' ');
    const words = text.toLowerCase().split(/\s+/);
    
    // Filter out common words and keep relevant nouns/verbs
    const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    const keywords = words.filter(word => 
      word.length > 3 && 
      !stopWords.has(word) && 
      /^[a-zA-Z]+$/.test(word)
    );
    
    return [...new Set(keywords)].slice(0, 5);
  };

  const handleSearch = () => {
    if (searchTerm.trim()) {
      searchBroll(searchTerm, { clipId: clip.id });
      
      posthog.capture('broll_search', { 
        clipId: clip.id, 
        searchTerm 
      });
    }
  };

  const handleApproveSuggestion = (suggestion: BrollSuggestion) => {
    const selection: BrollSelection = {
      suggestionId: suggestion.id,
      startTime: 0, // User can adjust
      duration: Math.min(suggestion.duration, 10), // Max 10s
      opacity: 0.8,
      position: 'overlay'
    };

    setSelectedSuggestions(prev => [...prev, selection]);
    
    posthog.capture('broll_approve', { 
      clipId: clip.id, 
      brollId: suggestion.id,
      relevanceScore: suggestion.relevanceScore,
      source: suggestion.source
    });

    toast({
      title: "B-roll aprovado! 🎬",
      description: `"${suggestion.title}" será aplicado ao clipe`
    });
  };

  const handleRejectSuggestion = (suggestion: BrollSuggestion) => {
    posthog.capture('broll_reject', { 
      clipId: clip.id, 
      brollId: suggestion.id,
      relevanceScore: suggestion.relevanceScore,
      reason: 'user_reject'
    });

    toast({
      title: "Sugestão rejeitada",
      description: "Feedback ajudará nas próximas sugestões"
    });
  };

  const handleApplySelections = () => {
    if (selectedSuggestions.length > 0) {
      onApply?.(selectedSuggestions);
      
      posthog.capture('broll_apply', { 
        clipId: clip.id, 
        brollCount: selectedSuggestions.length 
      });

      toast({
        title: "B-roll aplicado! 🎉",
        description: `${selectedSuggestions.length} elementos adicionados`
      });
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRelevanceIcon = (score: number) => {
    if (score >= 80) return <Star className="w-3 h-3 text-yellow-500" />;
    if (score >= 60) return <Sparkles className="w-3 h-3 text-blue-500" />;
    if (score >= 40) return <Zap className="w-3 h-3 text-purple-500" />;
    return <Clock className="w-3 h-3 text-gray-500" />;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="w-5 h-5" />
            B-roll Assistido
            <Badge variant="outline" className="text-xs">
              Não automático
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <Input
              placeholder="Buscar imagens/vídeos específicos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button 
              onClick={handleSearch}
              disabled={loading}
              className="gap-1"
            >
              <Search className="w-4 h-4" />
              Buscar
            </Button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Analisando sugestões...</p>
            </div>
          )}

          <Tabs defaultValue="suggestions" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="suggestions">
                Sugestões ({suggestions.length})
              </TabsTrigger>
              <TabsTrigger value="selected">
                Selecionados ({selectedSuggestions.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="suggestions" className="space-y-3">
              {suggestions.filter(s => s.relevanceScore >= 40).map((suggestion) => (
                <Card key={suggestion.id} className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex gap-3">
                      {/* Thumbnail */}
                      <div className="relative">
                        <AspectRatio ratio={16/9} className="w-20">
                          <img
                            src={suggestion.thumbnailUrl}
                            alt={suggestion.title}
                            className="w-full h-full object-cover rounded"
                          />
                        </AspectRatio>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute inset-0 opacity-0 hover:opacity-100 bg-black/50"
                          onClick={() => setPreviewSuggestion(suggestion.id)}
                        >
                          <Eye className="w-4 h-4 text-white" />
                        </Button>
                      </div>

                      {/* Info */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-sm font-medium line-clamp-1">
                              {suggestion.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              {getRelevanceIcon(suggestion.relevanceScore)}
                              <span className="text-xs text-muted-foreground">
                                Relevância: {suggestion.relevanceScore}%
                              </span>
                              <Badge 
                                className={`text-xs ${getConfidenceColor(suggestion.confidence)}`}
                              >
                                {suggestion.confidence}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Keywords */}
                        <div className="flex flex-wrap gap-1">
                          {suggestion.keywords.slice(0, 3).map((keyword, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {keyword}
                            </Badge>
                          ))}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleApproveSuggestion(suggestion)}
                            className="gap-1 text-xs"
                          >
                            <ThumbsUp className="w-3 h-3" />
                            Usar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRejectSuggestion(suggestion)}
                            className="gap-1 text-xs"
                          >
                            <ThumbsDown className="w-3 h-3" />
                            Rejeitar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {suggestions.filter(s => s.relevanceScore >= 40).length === 0 && !loading && (
                <div className="text-center py-8">
                  <Video className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma sugestão relevante encontrada.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tente buscar termos específicos acima.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="selected" className="space-y-3">
              {selectedSuggestions.map((selection, index) => {
                const suggestion = suggestions.find(s => s.id === selection.suggestionId);
                if (!suggestion) return null;

                return (
                  <Card key={index} className="overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <AspectRatio ratio={16/9} className="w-16">
                          <img
                            src={suggestion.thumbnailUrl}
                            alt={suggestion.title}
                            className="w-full h-full object-cover rounded"
                          />
                        </AspectRatio>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium">{suggestion.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            {selection.duration}s • {selection.position}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedSuggestions(prev => 
                            prev.filter((_, i) => i !== index)
                          )}
                        >
                          Remover
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {selectedSuggestions.length > 0 && (
                <Button 
                  onClick={handleApplySelections}
                  className="w-full gap-2"
                >
                  <Video className="w-4 h-4" />
                  Aplicar B-roll ({selectedSuggestions.length})
                </Button>
              )}

              {selectedSuggestions.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    Nenhum B-roll selecionado ainda.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
