import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Search, Sparkles, Lightbulb } from 'lucide-react';

interface SpecificMomentsInputProps {
  value: string;
  onChange: (value: string) => void;
}

const EXAMPLE_QUERIES = [
  'momentos engraçados',
  'quando alguém fala sobre dinheiro',
  'erros e falhas',
  'dicas práticas',
  'histórias pessoais',
  'momentos de surpresa',
];

export const SpecificMomentsInput = ({ value, onChange }: SpecificMomentsInputProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5 text-primary" />
          Busca Específica de Momentos
          <Badge variant="secondary" className="ml-auto">
            <Sparkles className="w-3 h-3 mr-1" />
            IA
          </Badge>
        </CardTitle>
        <CardDescription>
          Use IA para encontrar momentos específicos no vídeo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input Field */}
        <div className="space-y-2">
          <Label htmlFor="specific-moments">
            O que você está procurando? (opcional)
          </Label>
          <Textarea
            id="specific-moments"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Ex: encontre todos os momentos quando alguém conta uma história engraçada..."
            className="min-h-[100px] resize-none"
            maxLength={300}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Descreva o tipo de momento que você quer encontrar</span>
            <span>{value.length}/300</span>
          </div>
        </div>

        {/* Example Queries */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            Exemplos de buscas
          </Label>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((query) => (
              <button
                key={query}
                onClick={() => onChange(query)}
                className="px-3 py-1.5 text-xs font-medium rounded-full border border-border
                         hover:border-primary hover:bg-primary/5 transition-colors"
              >
                {query}
              </button>
            ))}
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium">Como funciona</p>
              <ul className="text-xs text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>
                    A IA analisará a transcrição do vídeo buscando os momentos descritos
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>
                    Seja específico: "quando alguém fala sobre investimentos" é melhor que "finanças"
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>
                    Você pode combinar com as outras configurações de clipes
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>
                    Se deixar vazio, a IA selecionará automaticamente os melhores momentos gerais
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Active Search Indicator */}
        {value.trim() && (
          <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-900 dark:text-green-100">
                <strong>Busca ativa:</strong> "{value.trim()}"
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
