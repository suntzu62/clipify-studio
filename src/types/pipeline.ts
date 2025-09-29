export type VideoSource = {
  youtubeUrl?: string;
  upload?: {
    bucket: string;
    objectKey: string;
    originalName?: string;
  };
  sourceType?: 'youtube' | 'upload';
};

export interface JobData extends VideoSource {
  rootId?: string;
  neededMinutes?: number;
  targetDuration?: number;
  meta?: Record<string, any>;
}

export interface VideoInfo {
  id?: string;
  title: string;
  duration: number;
  width?: number;
  height?: number;
  webpage_url: string;
  _filename?: string;
  ext?: string;
}

export interface IngestResult {
  rootId: string;
  storagePaths: {
    video: string;
    audio: string;
    info: string;
  };
}
