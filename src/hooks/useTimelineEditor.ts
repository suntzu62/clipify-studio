import { useState, useCallback } from 'react';

interface TimelineAction {
  type: 'trim' | 'split' | 'reframe' | 'branding' | 'audio' | 'captions';
  data: any;
  timestamp: number;
}

interface TimelineState {
  inPoint: number;
  outPoint: number;
  duration: number;
  segments: TimelineSegment[];
}

interface TimelineSegment {
  id: string;
  start: number;
  end: number;
  type: 'video' | 'audio' | 'caption';
  data?: any;
}

interface UseTimelineEditorProps {
  duration: number;
  initialInPoint?: number;
  initialOutPoint?: number;
}

export const useTimelineEditor = ({
  duration,
  initialInPoint = 0,
  initialOutPoint
}: UseTimelineEditorProps) => {
  const [timeline, setTimeline] = useState<TimelineState>({
    inPoint: initialInPoint,
    outPoint: initialOutPoint || duration,
    duration,
    segments: [
      {
        id: 'main-video',
        start: initialInPoint,
        end: initialOutPoint || duration,
        type: 'video'
      }
    ]
  });

  const [actions, setActions] = useState<TimelineAction[]>([]);
  const [currentActionIndex, setCurrentActionIndex] = useState(-1);

  const addAction = useCallback((action: Omit<TimelineAction, 'timestamp'>) => {
    const newAction: TimelineAction = {
      ...action,
      timestamp: Date.now()
    };

    // Remove any actions after current index (for redo functionality)
    const newActions = actions.slice(0, currentActionIndex + 1);
    newActions.push(newAction);

    setActions(newActions);
    setCurrentActionIndex(newActions.length - 1);

    // Apply the action to timeline
    applyAction(newAction);
  }, [actions, currentActionIndex]);

  const applyAction = useCallback((action: TimelineAction) => {
    setTimeline(prev => {
      switch (action.type) {
        case 'trim':
          return {
            ...prev,
            inPoint: action.data.inPoint,
            outPoint: action.data.outPoint,
            segments: prev.segments.map(segment => 
              segment.id === 'main-video'
                ? { ...segment, start: action.data.inPoint, end: action.data.outPoint }
                : segment
            )
          };

        case 'split':
          const splitTime = action.data.time;
          return {
            ...prev,
            segments: prev.segments.flatMap(segment => {
              if (segment.id === 'main-video' && splitTime > segment.start && splitTime < segment.end) {
                return [
                  { ...segment, id: `${segment.id}-1`, end: splitTime },
                  { ...segment, id: `${segment.id}-2`, start: splitTime }
                ];
              }
              return segment;
            })
          };

        case 'reframe':
          // Add reframe data to timeline
          return {
            ...prev,
            segments: [
              ...prev.segments,
              {
                id: `reframe-${Date.now()}`,
                start: action.data.startTime || prev.inPoint,
                end: action.data.endTime || prev.outPoint,
                type: 'video',
                data: action.data
              }
            ]
          };

        case 'branding':
          // Add branding elements
          return {
            ...prev,
            segments: [
              ...prev.segments,
              {
                id: `brand-${Date.now()}`,
                start: action.data.startTime || 0,
                end: action.data.endTime || 3,
                type: 'video',
                data: action.data
              }
            ]
          };

        case 'audio':
          // Add audio processing
          return {
            ...prev,
            segments: prev.segments.map(segment => 
              segment.type === 'audio' || segment.id === 'main-video'
                ? { ...segment, data: { ...segment.data, audio: action.data } }
                : segment
            )
          };

        case 'captions':
          // Add caption track
          return {
            ...prev,
            segments: [
              ...prev.segments,
              {
                id: `captions-${Date.now()}`,
                start: prev.inPoint,
                end: prev.outPoint,
                type: 'caption',
                data: action.data
              }
            ]
          };

        default:
          return prev;
      }
    });
  }, []);

  const undo = useCallback(() => {
    if (currentActionIndex >= 0) {
      setCurrentActionIndex(prev => prev - 1);
      
      // Rebuild timeline from scratch with remaining actions
      rebuildTimeline(actions.slice(0, currentActionIndex));
    }
  }, [currentActionIndex, actions]);

  const redo = useCallback(() => {
    if (currentActionIndex < actions.length - 1) {
      const nextIndex = currentActionIndex + 1;
      setCurrentActionIndex(nextIndex);
      
      // Apply the next action
      applyAction(actions[nextIndex]);
    }
  }, [currentActionIndex, actions, applyAction]);

  const rebuildTimeline = useCallback((actionsList: TimelineAction[]) => {
    // Reset timeline to initial state
    setTimeline({
      inPoint: initialInPoint,
      outPoint: initialOutPoint || duration,
      duration,
      segments: [
        {
          id: 'main-video',
          start: initialInPoint,
          end: initialOutPoint || duration,
          type: 'video'
        }
      ]
    });

    // Reapply all actions in order
    actionsList.forEach(action => applyAction(action));
  }, [duration, initialInPoint, initialOutPoint, applyAction]);

  const canUndo = currentActionIndex >= 0;
  const canRedo = currentActionIndex < actions.length - 1;

  // Semantic padding: align cuts to sentence boundaries
  const applySemanticPadding = useCallback((segments: any[], padding = 0.3) => {
    if (!segments || segments.length === 0) return { inPoint: timeline.inPoint, outPoint: timeline.outPoint };

    // Find closest sentence boundaries
    const findSentenceBoundary = (time: number, direction: 'before' | 'after') => {
      const sentenceEnders = ['.', '!', '?'];
      
      for (const segment of segments) {
        if (direction === 'before' && segment.end <= time) {
          const text = segment.text || '';
          if (sentenceEnders.some(ender => text.trim().endsWith(ender))) {
            return segment.end;
          }
        } else if (direction === 'after' && segment.start >= time) {
          const text = segment.text || '';
          if (sentenceEnders.some(ender => text.trim().endsWith(ender))) {
            return segment.end;
          }
        }
      }
      return time;
    };

    const semanticInPoint = Math.max(0, findSentenceBoundary(timeline.inPoint, 'before') - padding);
    const semanticOutPoint = Math.min(duration, findSentenceBoundary(timeline.outPoint, 'after') + padding);

    return { inPoint: semanticInPoint, outPoint: semanticOutPoint };
  }, [timeline.inPoint, timeline.outPoint, duration]);

  return {
    timeline,
    inPoint: timeline.inPoint,
    outPoint: timeline.outPoint,
    segments: timeline.segments,
    actions,
    currentActionIndex,
    canUndo,
    canRedo,
    addAction,
    undo,
    redo,
    applySemanticPadding
  };
};