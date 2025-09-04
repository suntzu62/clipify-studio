import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog';
import { Loader2, Youtube } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface NewProjectFormProps {
  onSubmit: (youtubeUrl: string, neededMinutes: number, targetDuration: string) => Promise<void>;
  onClose: () => void;
}

const durationOptions = [
  { value: '30s', label: '30 segundos', minutes: 1 },
  { value: '60s', label: '60 segundos', minutes: 2 },
  { value: '90s', label: '90 segundos', minutes: 3 },
];

export const NewProjectForm = ({ onSubmit, onClose }: NewProjectFormProps) => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [targetDuration, setTargetDuration] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const selectedOption = durationOptions.find(opt => opt.value === targetDuration);
  const estimatedMinutes = selectedOption?.minutes || 0;

  const validateYouTubeUrl = (url: string) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/;
    return youtubeRegex.test(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!youtubeUrl.trim()) {
      toast({
        title: "URL obrigatória",
        description: "Por favor, insira uma URL do YouTube",
        variant: "destructive"
      });
      return;
    }

    if (!validateYouTubeUrl(youtubeUrl)) {
      toast({
        title: "URL inválida",
        description: "Por favor, insira uma URL válida do YouTube",
        variant: "destructive"
      });
      return;
    }

    if (!targetDuration) {
      toast({
        title: "Duração obrigatória",
        description: "Por favor, selecione a duração do clipe",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(youtubeUrl.trim(), estimatedMinutes, targetDuration);
      onClose();
    } catch (error) {
      console.error('Error creating project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Youtube className="w-5 h-5 text-primary" />
          Novo Projeto
        </DialogTitle>
      </DialogHeader>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="youtube-url">URL do YouTube</Label>
          <Input
            id="youtube-url"
            type="url"
            placeholder="https://youtube.com/watch?v=..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            className="w-full"
          />
          <p className="text-sm text-muted-foreground">
            Cole o link do vídeo do YouTube que deseja transformar em clipe
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="duration">Duração do clipe</Label>
          <Select value={targetDuration} onValueChange={setTargetDuration}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a duração" />
            </SelectTrigger>
            <SelectContent>
              {durationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {estimatedMinutes > 0 && (
            <p className="text-sm text-muted-foreground">
              Processamento estimado: {estimatedMinutes} {estimatedMinutes === 1 ? 'minuto' : 'minutos'}
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Criar Projeto
          </Button>
        </div>
      </form>
    </DialogContent>
  );
};