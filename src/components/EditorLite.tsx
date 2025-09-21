import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Scissors, 
  RotateCcw, 
  RotateCw,
  Volume2,
  Crop,
  Type,
  Download,
  Save
} from 'lucide-react';
import { Timeline } from '@/components/editor/Timeline';
import { TranscriptTrack } from '@/components/editor/TranscriptTrack';
import { ReframePanel } from '@/components/editor/ReframePanel';
import { BrandingPanel } from '@/components/editor/BrandingPanel';
import { AudioMixer } from '@/components/editor/AudioMixer';
import { CaptionDesigner } from '@/components/CaptionDesigner';
import { useToast } from '@/hooks/use-toast';
import { useTimelineEditor } from '@/hooks/useTimelineEditor';
import { Clip } from '@/hooks/useClipList';
import posthog from 'posthog-js';

interface EditorLiteProps {
  clip: Clip;
  onSave?: (editedClip: Clip) => void;
  onClose?: () => void;
}

export const EditorLite = ({ clip, onSave, onClose }: EditorLiteProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [activeTab, setActiveTab] = useState('timeline');
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);

  const {
    timeline,
    inPoint,
    outPoint,
    actions,
    canUndo,
    canRedo,
    addAction,
    undo,
    redo
  } = useTimelineEditor({
    duration: clip.duration,
    initialInPoint: 0,
    initialOutPoint: clip.duration
  });

  useEffect(() => {
    posthog.capture('editor_open', { 
      clipId: clip.id, 
      duration: clip.duration 
    });
  }, [clip.id, clip.duration]);

  const handlePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTrim = (newInPoint: number, newOutPoint: number) => {
    addAction({
      type: 'trim',
      data: { inPoint: newInPoint, outPoint: newOutPoint }
    });
    
    posthog.capture('editor_trim', { 
      clipId: clip.id, 
      oldDuration: outPoint - inPoint,
      newDuration: newOutPoint - newInPoint 
    });

    toast({
      title: "Corte aplicado! ✂️",
      description: `Duração: ${(newOutPoint - newInPoint).toFixed(1)}s`
    });
  };

  const handleSplit = () => {
    addAction({
      type: 'split',
      data: { time: currentTime }
    });

    posthog.capture('editor_split', { 
      clipId: clip.id, 
      splitTime: currentTime 
    });

    toast({
      title: "Clipe dividido! ✂️",
      description: "Use Ripple Trim para ajustar as partes"
    });
  };

  const handleSave = () => {
    const editedClip = {
      ...clip,
      duration: outPoint - inPoint,
      // Add editing metadata
      editActions: actions
    };
    
    onSave?.(editedClip);
    
    posthog.capture('editor_save', { 
      clipId: clip.id, 
      actionsCount: actions.length 
    });

    toast({
      title: "Alterações salvas! 💾",
      description: "Seu clipe foi atualizado com sucesso"
    });
  };

  const handleQuickRender = () => {
    posthog.capture('editor_quick_render', { clipId: clip.id });
    
    toast({
      title: "Renderização iniciada! 🎬",
      description: "Preview será gerado em alguns segundos"
    });
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Editor Rápido</h1>
            <Badge variant="outline">{clip.title}</Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={undo}
              disabled={!canUndo}
              className="gap-1"
            >
              <RotateCcw className="w-4 h-4" />
              Desfazer
            </Button>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={redo}
              disabled={!canRedo}
              className="gap-1"
            >
              <RotateCw className="w-4 h-4" />
              Refazer
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleQuickRender}
              className="gap-1"
            >
              <Download className="w-4 h-4" />
              Preview
            </Button>
            
            <Button 
              size="sm" 
              onClick={handleSave}
              className="gap-1"
            >
              <Save className="w-4 h-4" />
              Salvar
            </Button>
            
            {onClose && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClose}
              >
                Fechar
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Timeline Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Video Preview */}
          <div className="bg-black/5 border-b border-border p-4 flex items-center justify-center">
            <div className="relative w-80 aspect-[9/16] bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                src={clip.previewUrl}
                className="w-full h-full object-cover"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    setCurrentTime(0);
                  }
                }}
              />
              
              {/* Video Controls Overlay */}
              <div className="absolute bottom-4 left-4 right-4">
                <div className="flex items-center gap-2 bg-black/70 rounded-lg p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePlay}
                    className="text-white hover:bg-white/20"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSeek(Math.max(0, currentTime - 5))}
                    className="text-white hover:bg-white/20"
                  >
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSeek(Math.min(clip.duration, currentTime + 5))}
                    className="text-white hover:bg-white/20"
                  >
                    <SkipForward className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSplit}
                    className="text-white hover:bg-white/20"
                  >
                    <Scissors className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex-1 bg-background border-b border-border">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">Timeline</h3>
                
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Zoom:</span>
                  <Slider
                    value={[zoom]}
                    onValueChange={(value) => setZoom(value[0])}
                    min={0.5}
                    max={5}
                    step={0.1}
                    className="w-20"
                  />
                </div>
              </div>
              
              <Timeline
                duration={clip.duration}
                currentTime={currentTime}
                inPoint={inPoint}
                outPoint={outPoint}
                zoom={zoom}
                onSeek={handleSeek}
                onTrim={handleTrim}
              />
              
              <TranscriptTrack
                segments={clip.transcript || []}
                duration={clip.duration}
                currentTime={currentTime}
                zoom={zoom}
                onSeek={handleSeek}
              />
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="w-80 border-l border-border bg-card overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <TabsList className="grid w-full grid-cols-4 m-2">
              <TabsTrigger value="timeline" className="text-xs">
                <Type className="w-3 h-3 mr-1" />
                Edição
              </TabsTrigger>
              <TabsTrigger value="reframe" className="text-xs">
                <Crop className="w-3 h-3 mr-1" />
                Frame
              </TabsTrigger>
              <TabsTrigger value="brand" className="text-xs">
                <Badge className="w-3 h-3 mr-1" />
                Marca
              </TabsTrigger>
              <TabsTrigger value="audio" className="text-xs">
                <Volume2 className="w-3 h-3 mr-1" />
                Áudio
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="timeline" className="p-4 space-y-4">
              <CaptionDesigner 
                clip={clip}
                onSave={(captions) => {
                  posthog.capture('caption_save', { clipId: clip.id });
                  toast({
                    title: "Legendas salvas! 📝",
                    description: "Estilo aplicado com sucesso"
                  });
                }}
              />
            </TabsContent>
            
            <TabsContent value="reframe" className="p-4">
              <ReframePanel 
                clip={clip}
                onApply={(reframeData) => {
                  addAction({
                    type: 'reframe',
                    data: reframeData
                  });
                  
                  posthog.capture('reframe_apply', { clipId: clip.id });
                  
                  toast({
                    title: "Reframe aplicado! 📱",
                    description: "Enquadramento otimizado para 9:16"
                  });
                }}
              />
            </TabsContent>
            
            <TabsContent value="brand" className="p-4">
              <BrandingPanel 
                clip={clip}
                onApply={(brandData) => {
                  addAction({
                    type: 'branding',
                    data: brandData
                  });
                  
                  posthog.capture('branding_apply', { clipId: clip.id });
                  
                  toast({
                    title: "Marca aplicada! 🎨",
                    description: "Logo e elementos visuais adicionados"
                  });
                }}
              />
            </TabsContent>
            
            <TabsContent value="audio" className="p-4">
              <AudioMixer 
                clip={clip}
                onApply={(audioData) => {
                  addAction({
                    type: 'audio',
                    data: audioData
                  });
                  
                  posthog.capture('audio_mix', { clipId: clip.id });
                  
                  toast({
                    title: "Áudio mixado! 🎵",
                    description: "Níveis e qualidade otimizados"
                  });
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};