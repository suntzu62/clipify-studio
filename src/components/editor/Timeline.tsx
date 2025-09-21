import { useRef, useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface TimelineProps {
  duration: number;
  currentTime: number;
  inPoint: number;
  outPoint: number;
  zoom: number;
  onSeek: (time: number) => void;
  onTrim: (inPoint: number, outPoint: number) => void;
}

export const Timeline = ({
  duration,
  currentTime,
  inPoint,
  outPoint,
  zoom,
  onSeek,
  onTrim
}: TimelineProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'playhead' | 'inPoint' | 'outPoint' | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const timelineWidth = 800 * zoom;
  const pixelsPerSecond = timelineWidth / duration;

  const drawTimeline = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    
    // Clear canvas
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    // Draw time markers
    ctx.strokeStyle = '#e9ecef';
    ctx.lineWidth = 1;
    
    const timeStep = duration < 60 ? 5 : duration < 300 ? 10 : 30; // seconds between markers
    
    for (let time = 0; time <= duration; time += timeStep) {
      const x = (time / duration) * width;
      
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      
      // Time labels
      ctx.fillStyle = '#6c757d';
      ctx.font = '10px Inter';
      ctx.textAlign = 'center';
      
      const minutes = Math.floor(time / 60);
      const seconds = time % 60;
      const label = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      ctx.fillText(label, x, height - 5);
    }

    // Draw trim region
    const trimStart = (inPoint / duration) * width;
    const trimEnd = (outPoint / duration) * width;
    
    // Inactive regions
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, trimStart, height);
    ctx.fillRect(trimEnd, 0, width - trimEnd, height);
    
    // Active region
    ctx.fillStyle = 'rgba(124, 58, 237, 0.1)';
    ctx.fillRect(trimStart, 0, trimEnd - trimStart, height);
    
    // Trim handles
    ctx.fillStyle = '#7c3aed';
    ctx.fillRect(trimStart - 2, 0, 4, height);
    ctx.fillRect(trimEnd - 2, 0, 4, height);

    // Draw playhead
    const playheadX = (currentTime / duration) * width;
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    
    // Playhead handle
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(playheadX, 10, 6, 0, 2 * Math.PI);
    ctx.fill();

  }, [duration, currentTime, inPoint, outPoint, zoom]);

  useEffect(() => {
    drawTimeline();
  }, [drawTimeline]);

  const getTimeFromX = useCallback((x: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    
    return Math.max(0, Math.min(duration, (x / canvas.width) * duration));
  }, [duration]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = getTimeFromX(x);
    
    const playheadX = (currentTime / duration) * canvas.width;
    const inPointX = (inPoint / duration) * canvas.width;
    const outPointX = (outPoint / duration) * canvas.width;
    
    // Check what we're clicking on
    if (Math.abs(x - playheadX) < 10) {
      setIsDragging('playhead');
      setDragOffset(x - playheadX);
    } else if (Math.abs(x - inPointX) < 10) {
      setIsDragging('inPoint');
      setDragOffset(x - inPointX);
    } else if (Math.abs(x - outPointX) < 10) {
      setIsDragging('outPoint');
      setDragOffset(x - outPointX);
    } else {
      // Click to seek
      onSeek(time);
    }
  }, [currentTime, inPoint, outPoint, duration, getTimeFromX, onSeek]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - dragOffset;
    const time = getTimeFromX(x);

    switch (isDragging) {
      case 'playhead':
        onSeek(time);
        break;
      case 'inPoint':
        if (time < outPoint) {
          onTrim(time, outPoint);
        }
        break;
      case 'outPoint':
        if (time > inPoint) {
          onTrim(inPoint, time);
        }
        break;
    }
  }, [isDragging, dragOffset, inPoint, outPoint, getTimeFromX, onSeek, onTrim]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
    setDragOffset(0);
  }, []);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    if (canvas && container) {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = 80;
      drawTimeline();
    }
  }, [drawTimeline]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(handleResize);
    const container = containerRef.current;
    
    if (container) {
      resizeObserver.observe(container);
      handleResize(); // Initial resize
    }
    
    return () => {
      if (container) {
        resizeObserver.unobserve(container);
      }
    };
  }, [handleResize]);

  return (
    <div 
      ref={containerRef}
      className="relative bg-background border border-border rounded-lg overflow-hidden"
      style={{ minHeight: '80px' }}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          "cursor-pointer",
          isDragging && "cursor-grabbing"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      
      {/* Timeline info */}
      <div className="absolute top-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
        {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(1).padStart(4, '0')} / {Math.floor(duration / 60)}:{(duration % 60).toFixed(0).padStart(2, '0')}
      </div>
    </div>
  );
};