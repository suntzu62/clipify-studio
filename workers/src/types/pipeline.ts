export type VideoInfo = {
  id?: string;
  title: string;
  duration: number;
  thumbnail?: string;
  originalUrl?: string;
  description?: string;
  fps?: number;
  dimensions?: {
    width: number;
    height: number;
  };
  meta?: Record<string, any>;
  width?: number;
  height?: number;
  webpage_url?: string;
  ext?: string;
  [key: string]: any;
}

export type UploadInfo = {
  bucket: string;
  objectKey: string;
  publicUrl?: string;
}
