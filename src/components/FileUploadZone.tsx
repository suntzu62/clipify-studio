import { useState, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, FileVideo, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { saveUserJob } from '@/lib/storage';
import { Job, createJobFromUpload } from '@/lib/jobs-api';

interface FileUploadZoneProps {
  className?: string;
  onUploadSuccess?: (jobId: string) => void;
}

export function FileUploadZone({ className, onUploadSuccess }: FileUploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { getToken, user } = useAuth();

  const uploadFile = useCallback(async (file: File) => {
    if (!user) {
      setError('Faça login para fazer upload');
      toast({
        title: 'Login necessário',
        description: 'Você precisa estar logado para fazer upload de vídeos',
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Create FormData with video file
      const formData = new FormData();
      formData.append('video', file);

      // Upload to edge function with progress tracking
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.floor((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
        }
      });

      // Handle completion
      const uploadPromise = new Promise<{ jobId: string; storagePath: string }>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.message || 'Upload failed'));
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });
      });

      // Start upload
      xhr.open('POST', 'https://qibjqqucmbrtuirysexl.supabase.co/functions/v1/upload-video');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);

      const { storagePath } = await uploadPromise;

      setUploadProgress(100);

      // Now create the job in the backend to start processing
      const { jobId } = await createJobFromUpload(
        user.id,
        storagePath,
        file.name,
        getToken
      );

      // Save job to local storage
      const job: Job = {
        id: jobId,
        youtubeUrl: `upload://${file.name}`,
        status: 'queued',
        progress: 0,
        createdAt: new Date().toISOString(),
        neededMinutes: Math.ceil(file.size / (1024 * 1024 * 60)), // rough estimate
        result: {
          metadata: {
            title: file.name.replace(/\.[^/.]+$/, ''),
            thumbnail: undefined,
            channel: undefined
          }
        }
      };
      saveUserJob(user.id, job);

      toast({
        title: 'Upload concluído! ✨',
        description: 'Processando seu vídeo...'
      });

      setTimeout(() => {
        onUploadSuccess?.(jobId);
        navigate(`/projects/${jobId}`);
      }, 500);

    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Falha no upload');
      toast({
        title: 'Erro no upload',
        description: err.message || 'Não foi possível fazer upload do arquivo',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  }, [user, getToken, navigate, onUploadSuccess]);

  const validateFile = (file: File): string | null => {
    const maxSize = 5 * 1024 * 1024 * 1024; // 5GB
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    
    if (file.size > maxSize) {
      return 'Arquivo muito grande. Máximo: 5GB';
    }
    
    if (!allowedTypes.includes(file.type)) {
      return 'Formato não suportado. Use: MP4, MOV, AVI, MKV';
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
                  Formatos: MP4, MOV, AVI, MKV • Máximo: 5GB
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