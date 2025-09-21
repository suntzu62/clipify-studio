import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Plus, X } from 'lucide-react';

interface KeywordEmphasisData {
  word: string;
  color: string;
  scale: number;
  emoji?: string;
}

interface KeywordEmphasisProps {
  keywords: KeywordEmphasisData[];
  onKeywordsChange: (keywords: KeywordEmphasisData[]) => void;
  transcript: Array<{ start: number; end: number; text: string }>;
}

export const KeywordEmphasis = ({ keywords, onKeywordsChange, transcript }: KeywordEmphasisProps) => {
  const [newKeyword, setNewKeyword] = useState('');

  const addKeyword = () => {
    if (newKeyword.trim()) {
      const keyword: KeywordEmphasisData = {
        word: newKeyword.trim(),
        color: '#ff6b35',
        scale: 1.2
      };
      onKeywordsChange([...keywords, keyword]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (index: number) => {
    onKeywordsChange(keywords.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Palavra para destacar..."
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
        />
        <Button onClick={addKeyword} size="sm">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword, index) => (
          <Badge key={index} variant="outline" className="gap-1">
            <Sparkles className="w-3 h-3" />
            {keyword.word}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeKeyword(index)}
              className="h-4 w-4 p-0"
            >
              <X className="w-3 h-3" />
            </Button>
          </Badge>
        ))}
      </div>
    </div>
  );
};