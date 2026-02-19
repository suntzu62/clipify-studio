import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';

// Use vi.hoisted for variables used in mock factories
const { mockFfprobe, mockDownloadFile } = vi.hoisted(() => ({
  mockFfprobe: vi.fn(),
  mockDownloadFile: vi.fn(),
}));

// Mock all external dependencies
vi.mock('@distube/ytdl-core', () => ({
  default: Object.assign(vi.fn(), {
    getInfo: vi.fn(),
    chooseFormat: vi.fn(),
  }),
}));

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('fluent-ffmpeg', () => {
  const mock = vi.fn();
  mock.ffprobe = mockFfprobe;
  return { default: mock };
});

vi.mock('../config/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../config/env.js', () => ({
  env: {
    supabase: { bucket: 'test-bucket' },
  },
}));

vi.mock('./storage.js', () => ({
  downloadFile: mockDownloadFile,
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    createWriteStream: vi.fn(() => ({
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    })),
    promises: {
      stat: vi.fn(),
      unlink: vi.fn(),
      writeFile: vi.fn(),
      readdir: vi.fn(),
    },
  };
});

vi.mock('stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

import {
  downloadVideo,
  extractMetadata,
  validateVideo,
  cleanupVideo,
} from './download.js';
import ytdl from '@distube/ytdl-core';
import { execa } from 'execa';

describe('download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('extractMetadata', () => {
    it('should extract metadata from video file', async () => {
      mockFfprobe.mockImplementation((path, callback) => {
        callback(null, {
          format: { duration: 120.5 },
          streams: [
            {
              codec_type: 'video',
              width: 1920,
              height: 1080,
            },
            {
              codec_type: 'audio',
              channels: 2,
            },
          ],
        });
      });

      const result = await extractMetadata('/path/to/video.mp4');

      expect(result).toEqual({
        title: 'video.mp4',
        duration: 120.5,
        width: 1920,
        height: 1080,
        url: '/path/to/video.mp4',
      });
    });

    it('should handle string duration', async () => {
      mockFfprobe.mockImplementation((path, callback) => {
        callback(null, {
          format: { duration: '90.25' },
          streams: [
            { codec_type: 'video', width: 1280, height: 720 },
          ],
        });
      });

      const result = await extractMetadata('/path/to/video.mp4');

      expect(result.duration).toBe(90.25);
    });

    it('should throw error when no video stream found', async () => {
      mockFfprobe.mockImplementation((path, callback) => {
        callback(null, {
          format: { duration: 60 },
          streams: [{ codec_type: 'audio' }],
        });
      });

      await expect(extractMetadata('/path/to/audio.mp3')).rejects.toThrow(
        'No video stream found'
      );
    });

    it('should throw error on ffprobe failure', async () => {
      mockFfprobe.mockImplementation((path, callback) => {
        callback(new Error('FFprobe error'), null);
      });

      await expect(extractMetadata('/path/to/invalid.mp4')).rejects.toThrow(
        'FFprobe failed'
      );
    });

    it('should handle missing duration', async () => {
      mockFfprobe.mockImplementation((path, callback) => {
        callback(null, {
          format: {},
          streams: [{ codec_type: 'video', width: 640, height: 480 }],
        });
      });

      const result = await extractMetadata('/path/to/video.mp4');

      expect(result.duration).toBe(0);
    });
  });

  describe('validateVideo', () => {
    it('should return true for valid video file', async () => {
      (fs.stat as any).mockResolvedValue({
        isFile: () => true,
        size: 1000000,
      });

      mockFfprobe.mockImplementation((path, callback) => {
        callback(null, {
          format: { duration: 60 },
          streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
        });
      });

      const result = await validateVideo('/path/to/video.mp4');

      expect(result).toBe(true);
    });

    it('should return false for empty file', async () => {
      (fs.stat as any).mockResolvedValue({
        isFile: () => true,
        size: 0,
      });

      const result = await validateVideo('/path/to/empty.mp4');

      expect(result).toBe(false);
    });

    it('should return false for directory', async () => {
      (fs.stat as any).mockResolvedValue({
        isFile: () => false,
        size: 1000,
      });

      const result = await validateVideo('/path/to/directory');

      expect(result).toBe(false);
    });

    it('should return false when ffprobe fails', async () => {
      (fs.stat as any).mockResolvedValue({
        isFile: () => true,
        size: 1000000,
      });

      mockFfprobe.mockImplementation((path, callback) => {
        callback(new Error('Invalid format'), null);
      });

      const result = await validateVideo('/path/to/invalid.mp4');

      expect(result).toBe(false);
    });

    it('should return false when file does not exist', async () => {
      (fs.stat as any).mockRejectedValue(new Error('ENOENT'));

      const result = await validateVideo('/path/to/nonexistent.mp4');

      expect(result).toBe(false);
    });
  });

  describe('downloadVideo', () => {
    it('should throw error for invalid source type', async () => {
      await expect(
        downloadVideo('youtube' as any, undefined, undefined)
      ).rejects.toThrow('Invalid source type or missing parameters');
    });

    it('should throw error for youtube without URL', async () => {
      await expect(
        downloadVideo('youtube', undefined, undefined)
      ).rejects.toThrow('Invalid source type or missing parameters');
    });

    it('should throw error for upload without path', async () => {
      await expect(
        downloadVideo('upload', undefined, undefined)
      ).rejects.toThrow('Invalid source type or missing parameters');
    });
  });

  describe('cleanupVideo', () => {
    it('should delete video file', async () => {
      (fs.unlink as any).mockResolvedValue(undefined);

      await cleanupVideo('/path/to/video.mp4');

      expect(fs.unlink).toHaveBeenCalledWith('/path/to/video.mp4');
    });

    it('should not throw error when file does not exist', async () => {
      (fs.unlink as any).mockRejectedValue(new Error('ENOENT'));

      await expect(cleanupVideo('/path/to/nonexistent.mp4')).resolves.not.toThrow();
    });
  });
});
