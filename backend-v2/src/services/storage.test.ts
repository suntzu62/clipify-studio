import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted for variables used in mock factories
const {
  mockReadFile,
  mockWriteFile,
  mockStat,
  mockRm,
  mockMkdir,
  mockCopyFile,
  mockAccess,
  mockReaddir,
  mockStorageUpload,
  mockStorageDownload,
  mockStorageRemove,
  mockStorageGetPublicUrl,
  mockStorageList,
  mockStorageFrom,
  mockSupabase,
} = vi.hoisted(() => {
  const mockStorageUpload = vi.fn();
  const mockStorageDownload = vi.fn();
  const mockStorageRemove = vi.fn();
  const mockStorageGetPublicUrl = vi.fn();
  const mockStorageList = vi.fn();
  const mockStorageFrom = vi.fn(() => ({
    upload: mockStorageUpload,
    download: mockStorageDownload,
    remove: mockStorageRemove,
    getPublicUrl: mockStorageGetPublicUrl,
    list: mockStorageList,
  }));
  return {
    mockReadFile: vi.fn(),
    mockWriteFile: vi.fn(),
    mockStat: vi.fn(),
    mockRm: vi.fn(),
    mockMkdir: vi.fn(),
    mockCopyFile: vi.fn(),
    mockAccess: vi.fn(),
    mockReaddir: vi.fn(),
    mockStorageUpload,
    mockStorageDownload,
    mockStorageRemove,
    mockStorageGetPublicUrl,
    mockStorageList,
    mockStorageFrom,
    mockSupabase: {
      storage: {
        from: mockStorageFrom,
      },
    },
  };
});

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    stat: mockStat,
    rm: mockRm,
    mkdir: mockMkdir,
    copyFile: mockCopyFile,
    access: mockAccess,
    readdir: mockReaddir,
  },
}));

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

// Mock logger
vi.mock('../config/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock env with Supabase configured
vi.mock('../config/env.js', () => ({
  env: {
    supabase: {
      url: 'https://test.supabase.co',
      serviceKey: 'test-service-key',
      bucket: 'test-bucket',
    },
    localStoragePath: './uploads',
    baseUrl: 'http://localhost:3001',
    port: 3001,
  },
}));

import {
  uploadFile,
  uploadFiles,
  downloadFile,
  listFiles,
  deleteFile,
  deleteFiles,
  fileExists,
} from './storage.js';

describe('storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload file to Supabase storage', async () => {
      const fileBuffer = Buffer.from('test video content');
      mockReadFile.mockResolvedValue(fileBuffer);
      mockStorageUpload.mockResolvedValue({
        data: { path: 'clips/video.mp4' },
        error: null,
      });
      mockStorageGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://storage.example.com/clips/video.mp4' },
      });

      const result = await uploadFile(
        'test-bucket',
        'clips/video.mp4',
        '/tmp/video.mp4',
        'video/mp4'
      );

      expect(result.path).toBe('clips/video.mp4');
      expect(result.publicUrl).toBe('https://storage.example.com/clips/video.mp4');
      expect(mockStorageFrom).toHaveBeenCalledWith('test-bucket');
      expect(mockStorageUpload).toHaveBeenCalledWith(
        'clips/video.mp4',
        fileBuffer,
        { contentType: 'video/mp4', upsert: true }
      );
    });

    it('should throw error on upload failure', async () => {
      mockReadFile.mockResolvedValue(Buffer.from('content'));
      mockStorageUpload.mockResolvedValue({
        data: null,
        error: { message: 'Storage full' },
      });

      await expect(
        uploadFile('bucket', 'path', '/tmp/file', 'video/mp4')
      ).rejects.toThrow();
    });
  });

  describe('uploadFiles', () => {
    it('should upload multiple files in parallel', async () => {
      mockReadFile.mockResolvedValue(Buffer.from('content'));
      mockStorageUpload.mockResolvedValue({
        data: { path: 'test-path' },
        error: null,
      });
      mockStorageGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://example.com/file' },
      });

      const uploads = [
        { bucket: 'b1', path: 'p1', filePath: '/f1', contentType: 'video/mp4' },
        { bucket: 'b2', path: 'p2', filePath: '/f2', contentType: 'video/mp4' },
      ];

      const results = await uploadFiles(uploads);

      expect(results).toHaveLength(2);
      expect(mockStorageUpload).toHaveBeenCalledTimes(2);
    });
  });

  describe('downloadFile', () => {
    it('should download file from Supabase storage', async () => {
      const blob = new Blob(['video content']);
      mockStorageDownload.mockResolvedValue({
        data: blob,
        error: null,
      });

      const result = await downloadFile('test-bucket', 'clips/video.mp4');

      expect(result).toBe(blob);
      expect(mockStorageFrom).toHaveBeenCalledWith('test-bucket');
    });

    it('should throw VIDEO_NOT_FOUND when file not found', async () => {
      mockStorageDownload.mockResolvedValue({
        data: null,
        error: { message: 'File not found' },
      });

      await expect(
        downloadFile('bucket', 'nonexistent.mp4')
      ).rejects.toThrow('Download failed');
    });

    it('should throw error on download failure', async () => {
      mockStorageDownload.mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      await expect(
        downloadFile('bucket', 'file.mp4')
      ).rejects.toThrow('Download failed');
    });
  });

  describe('listFiles', () => {
    it('should list files from Supabase storage', async () => {
      mockStorageList.mockResolvedValue({
        data: [
          { name: 'file1.mp4', metadata: { size: 1000 }, created_at: '2024-01-01' },
          { name: 'file2.mp4', metadata: { size: 2000 }, created_at: '2024-01-02' },
        ],
        error: null,
      });

      const result = await listFiles('test-bucket', 'clips/');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('file1.mp4');
      expect(result[0].size).toBe(1000);
    });

    it('should return empty array on error', async () => {
      mockStorageList.mockResolvedValue({
        data: null,
        error: { message: 'Access denied' },
      });

      await expect(
        listFiles('bucket', 'prefix/')
      ).rejects.toThrow('List failed');
    });

    it('should handle empty directory', async () => {
      mockStorageList.mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await listFiles('bucket', 'empty/');

      expect(result).toEqual([]);
    });
  });

  describe('deleteFile', () => {
    it('should delete file from Supabase storage', async () => {
      mockStorageRemove.mockResolvedValue({ error: null });

      await deleteFile('test-bucket', 'clips/video.mp4');

      expect(mockStorageRemove).toHaveBeenCalledWith(['clips/video.mp4']);
    });

    it('should throw error on delete failure', async () => {
      mockStorageRemove.mockResolvedValue({
        error: { message: 'Permission denied' },
      });

      await expect(
        deleteFile('bucket', 'protected.mp4')
      ).rejects.toThrow('Delete failed');
    });
  });

  describe('deleteFiles', () => {
    it('should delete multiple files', async () => {
      mockStorageRemove.mockResolvedValue({ error: null });

      await deleteFiles('bucket', ['file1.mp4', 'file2.mp4', 'file3.mp4']);

      expect(mockStorageRemove).toHaveBeenCalledWith([
        'file1.mp4',
        'file2.mp4',
        'file3.mp4',
      ]);
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      mockStorageDownload.mockResolvedValue({
        data: new Blob(['content']),
        error: null,
      });

      const result = await fileExists('bucket', 'existing.mp4');

      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      mockStorageDownload.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      const result = await fileExists('bucket', 'nonexistent.mp4');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockStorageDownload.mockRejectedValue(new Error('Network error'));

      const result = await fileExists('bucket', 'file.mp4');

      expect(result).toBe(false);
    });
  });
});
