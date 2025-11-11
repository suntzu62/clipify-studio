import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { GENRE_OPTIONS, GenreType } from '@/types/project-config';
import { Sparkles } from 'lucide-react';

interface GenreSelectorProps {
  value: GenreType;
  onChange: (value: GenreType) => void;
}

export const GenreSelector = ({ value, onChange }: GenreSelectorProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Categoria do Conteúdo
        </CardTitle>
        <CardDescription>
          Ajuda a IA a entender melhor o contexto e selecionar os melhores momentos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {GENRE_OPTIONS.map((genre) => (
            <button
              key={genre.value}
              onClick={() => onChange(genre.value)}
              className={cn(
                'relative flex items-center gap-3 p-4 rounded-lg border-2 transition-all hover:shadow-md',
                'text-left',
                value === genre.value
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <span className="text-2xl">{genre.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium truncate',
                  value === genre.value && 'text-primary'
                )}>
                  {genre.label}
                </p>
              </div>
              {genre.value === 'auto' && (
                <Badge variant="secondary" className="absolute top-2 right-2 text-xs">
                  IA
                </Badge>
              )}
              {value === genre.value && (
                <div className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Info about selected genre */}
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">
            {value === 'auto' && (
              <>
                <strong>🤖 Detecção Automática:</strong> A IA analisará o conteúdo e escolherá
                automaticamente a melhor categoria para otimizar a seleção de clipes.
              </>
            )}
            {value === 'podcast' && (
              <>
                <strong>🎙️ Podcast:</strong> Otimizado para conversas longas, entrevistas e
                discussões. Foca em momentos de insights e histórias interessantes.
              </>
            )}
            {value === 'lifestyle' && (
              <>
                <strong>🏃 Lifestyle:</strong> Perfeito para vlogs, rotinas diárias e conteúdo
                pessoal. Destaca momentos autênticos e relatáveis.
              </>
            )}
            {value === 'sports' && (
              <>
                <strong>⚽ Sports:</strong> Especializado em esportes e competições. Identifica
                lances, gols, e momentos de emoção intensa.
              </>
            )}
            {value === 'news' && (
              <>
                <strong>📰 News:</strong> Ideal para notícias e atualidades. Prioriza informações
                importantes e declarações relevantes.
              </>
            )}
            {value === 'educational' && (
              <>
                <strong>🎓 Educational:</strong> Para conteúdo educativo e tutoriais. Foca em
                explicações claras e demonstrações práticas.
              </>
            )}
            {value === 'entertainment' && (
              <>
                <strong>🎬 Entertainment:</strong> Conteúdo de entretenimento geral. Destaca
                momentos engraçados, surpreendentes e emocionantes.
              </>
            )}
            {value === 'marketing' && (
              <>
                <strong>📊 Marketing & Webinar:</strong> Para apresentações e webinars. Prioriza
                pontos-chave, CTAs e demonstrações de produto.
              </>
            )}
            {value === 'gaming' && (
              <>
                <strong>🎮 Gaming:</strong> Especializado em gameplay e transmissões. Identifica
                momentos épicos, vitórias e reações emocionantes.
              </>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
