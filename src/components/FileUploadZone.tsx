import { useState, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, FileVideo, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { saveUserJob } from '@/lib/storage';
import { Job } from '@/lib/jobs-api';

interface FileUploadZoneProps {
  className?: string;
  onUploadSuccess?: (jobId: string) => void;
}

export function FileUploadZone({ className, onUploadSuccess }: FileUploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { user } = useUser();

  const uploadFile = useCallback(async (file: File) => {
    if (!user) return;
    
    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // TODO: Implement actual file upload to Supabase storage
      // For now, create a placeholder job
      const jobId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const job: Job = {
        id: jobId,
        youtubeUrl: `file://${file.name}`,
        status: 'queued',
        progress: 0,
        createdAt: new Date().toISOString(),
        neededMinutes: Math.ceil(file.size / (1024 * 1024)) // rough estimate
      };

      saveUserJob(user.id, job);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      setTimeout(() => {
        onUploadSuccess?.(jobId);
        navigate(`/projects/${jobId}`);
      }, 500);

    } catch (err: any) {
      setError(err.message || 'Falha no upload');
      toast({
        title: 'Erro no upload',
        description: err.message || 'Não foi possível fazer upload do arquivo',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [user, navigate, onUploadSuccess]);

  const validateFile = (file: File): string | null => {
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/avi', 'video/mov'];
    
    if (file.size > maxSize) {
      return 'Arquivo muito grande. Máximo: 2GB';
    }
    
    if (!allowedTypes.includes(file.type)) {
      return 'Formato não suportado. Use: MP4, MOV, AVI';
    }
    
    return null;
  };

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.quicktime']
    },
    maxFiles: 1,
    onDrop: (acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        setError('Tipo de arquivo não suportado');
        return;
      }
      
      const file = acceptedFiles[0];
      if (!file) return;
      
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      
      uploadFile(file);
    }
  });

  return (
    <Card className={cn("border-2 border-dashed transition-colors", className, {
      'border-primary bg-primary/5': isDragActive && !isDragReject,
      'border-destructive bg-destructive/5': isDragReject,
      'border-muted-foreground/25': !isDragActive && !uploading
    })}>
      <CardContent className="p-6">
        <div {...getRootProps()} className="cursor-pointer">
          <input {...getInputProps()} disabled={uploading} />
          
          {uploading ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
                <Upload className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Fazendo Upload...</h3>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-sm text-muted-foreground">{uploadProgress}% concluído</p>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto transition-colors",
                isDragActive ? "bg-primary/20" : "bg-muted/50"
              )}>
                <FileVideo className={cn(
                  "w-8 h-8 transition-colors",
                  isDragActive ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">
                  {isDragActive ? 'Solte o arquivo aqui' : 'Arraste seu vídeo aqui'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  ou clique para selecionar
                </p>
                <p className="text-xs text-muted-foreground">
                  Formatos: MP4, MOV, AVI • Máximo: 2GB
                </p>
              </div>
              
              <Button variant="outline" type="button" disabled={uploading}>
                <Upload className="w-4 h-4 mr-2" />
                Selecionar Arquivo
              </Button>
            </div>
          )}
        </div>
        
        {error && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}