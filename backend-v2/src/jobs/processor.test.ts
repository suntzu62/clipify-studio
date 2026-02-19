import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from 'bullmq';

// Use vi.hoisted for variables used in mock factories
const {
  mockDownloadVideo,
  mockCleanupVideo,
  mockTranscribeVideo,
  mockCleanupAudio,
  mockAnalyzeHighlights,
  mockGenerateAutoClips,
  mockRenderClips,
  mockCleanupRenderDir,
  mockUploadFile,
  mockCheckUserLimits,
  mockIncrementUsage,
  mockDbJobsInsert,
  mockDbJobsUpdate,
  mockDbClipsUpsert,
  mockGenerateSeoMetadata,
  mockCalculateViralityScore,
  mockBuildVariationsFromMetadata,
  mockSendJobCompletedEmail,
  mockSendJobFailedEmail,
  mockRedis,
} = vi.hoisted(() => ({
  mockDownloadVideo: vi.fn(),
  mockCleanupVideo: vi.fn(),
  mockTranscribeVideo: vi.fn(),
  mockCleanupAudio: vi.fn(),
  mockAnalyzeHighlights: vi.fn(),
  mockGenerateAutoClips: vi.fn(),
  mockRenderClips: vi.fn(),
  mockCleanupRenderDir: vi.fn(),
  mockUploadFile: vi.fn(),
  mockCheckUserLimits: vi.fn(),
  mockIncrementUsage: vi.fn(),
  mockDbJobsInsert: vi.fn(),
  mockDbJobsUpdate: vi.fn(),
  mockDbClipsUpsert: vi.fn(),
  mockGenerateSeoMetadata: vi.fn(),
  mockCalculateViralityScore: vi.fn(),
  mockBuildVariationsFromMetadata: vi.fn(),
  mockSendJobCompletedEmail: vi.fn(),
  mockSendJobFailedEmail: vi.fn(),
  mockRedis: {
    publish: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
  },
}));

// Mock all external services
vi.mock('../services/download.js', () => ({
  downloadVideo: mockDownloadVideo,
  cleanupVideo: mockCleanupVideo,
}));

vi.mock('../services/transcription.js', () => ({
  transcribeVideo: mockTranscribeVideo,
  cleanupAudio: mockCleanupAudio,
}));

vi.mock('../services/analysis.js', () => ({
  analyzeHighlights: mockAnalyzeHighlights,
  generateAutoClips: mockGenerateAutoClips,
}));

vi.mock('../services/rendering.js', () => ({
  renderClips: mockRenderClips,
  cleanupRenderDir: mockCleanupRenderDir,
}));

vi.mock('../services/storage.js', () => ({
  uploadFile: mockUploadFile,
}));

vi.mock('../services/mercadopago.service.js', () => ({
  checkUserLimits: mockCheckUserLimits,
  incrementUsage: mockIncrementUsage,
}));

vi.mock('../services/database.service.js', () => ({
  jobs: {
    insert: mockDbJobsInsert,
    update: mockDbJobsUpdate,
  },
  clips: {
    upsert: mockDbClipsUpsert,
  },
}));

vi.mock('../services/metadata-generator.js', () => ({
  generateSeoMetadata: mockGenerateSeoMetadata,
}));

vi.mock('../services/virality-score.js', () => ({
  calculateViralityScore: mockCalculateViralityScore,
}));

vi.mock('../services/viral-insights-lite.js', () => ({
  buildVariationsFromMetadata: mockBuildVariationsFromMetadata,
}));

vi.mock('../services/job-notification.service.js', () => ({
  sendJobCompletedEmail: mockSendJobCompletedEmail,
  sendJobFailedEmail: mockSendJobFailedEmail,
}));

vi.mock('../config/redis.js', () => ({
  redis: mockRedis,
}));

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

import { processVideo } from './processor.js';

describe('processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful mock responses
    mockDownloadVideo.mockResolvedValue({
      videoPath: '/tmp/video.mp4',
      metadata: {
        duration: 120,
        width: 1920,
        height: 1080,
        title: 'Test Video',
      },
    });

    mockCheckUserLimits.mockResolvedValue({
      canUse: true,
      currentUsage: 0,
      maxAllowed: 100,
      planName: 'Pro',
    });

    mockTranscribeVideo.mockResolvedValue({
      transcript: {
        segments: [
          { start: 0, end: 30, text: 'First segment' },
          { start: 30, end: 60, text: 'Second segment' },
        ],
        duration: 120,
      },
      audioPath: '/tmp/audio.wav',
    });

    mockAnalyzeHighlights.mockResolvedValue({
      segments: [
        {
          start: 0,
          end: 60,
          score: 85,
          title: 'Test Highlight',
          summary: 'A great moment',
        },
      ],
    });

    mockGenerateAutoClips.mockReturnValue({
      segments: [
        {
          start: 0,
          end: 60,
          score: 70,
          title: 'Auto Highlight',
          reason: 'Auto-generated segment',
          keywords: ['auto'],
        },
      ],
      reasoning: 'Auto clipping disabled, using deterministic segmentation',
    });

    mockRenderClips.mockResolvedValue({
      clips: [
        {
          id: 'clip-1',
          outputPath: '/tmp/rendered/clip-1.mp4',
          thumbnailPath: '/tmp/rendered/clip-1.jpg',
          startTime: 0,
          endTime: 60,
          duration: 60,
          segment: {
            start: 0,
            end: 60,
            title: 'Test Highlight',
            reason: 'A great moment',
            keywords: ['test', 'highlight'],
          },
        },
      ],
      outputDir: '/tmp/rendered',
    });

    mockUploadFile.mockResolvedValue({
      path: 'clips/clip-1.mp4',
      publicUrl: 'https://storage.example.com/clips/clip-1.mp4',
    });

    mockGenerateSeoMetadata.mockResolvedValue({
      title: 'Generated Title',
      description: 'Generated description',
      hashtags: ['tag1', 'tag2'],
    });

    mockCalculateViralityScore.mockReturnValue({
      score: 85,
      components: { hook: 90, engagement: 80 },
      label: 'high',
    });

    mockBuildVariationsFromMetadata.mockReturnValue([
      { title: 'Variation 1', description: 'Desc 1' },
    ]);

    mockDbJobsInsert.mockResolvedValue({ id: 'job-123' });
    mockDbJobsUpdate.mockResolvedValue({ id: 'job-123' });
    mockDbClipsUpsert.mockResolvedValue({ id: 'clip-1' });
    mockIncrementUsage.mockResolvedValue(undefined);
    mockSendJobCompletedEmail.mockResolvedValue(true);
    mockSendJobFailedEmail.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createMockJob = (data: Partial<any> = {}): Job<any> => ({
    data: {
      jobId: 'job-123',
      userId: 'user-123',
      sourceType: 'youtube',
      youtubeUrl: 'https://youtube.com/watch?v=test123',
      targetDuration: 60,
      clipCount: 3,
      ...data,
    },
    updateProgress: vi.fn(),
    id: 'job-123',
    name: 'process-video',
    opts: {},
    timestamp: Date.now(),
    attemptsMade: 0,
    stacktrace: [],
    returnvalue: undefined,
    progress: 0,
  } as unknown as Job<any>);

  describe('quota validation', () => {
    it('should fail when clip limit exceeded', async () => {
      mockCheckUserLimits.mockImplementation(async (userId, type) => {
        if (type === 'clip') {
          return {
            canUse: false,
            currentUsage: 100,
            maxAllowed: 100,
            planName: 'Pro',
          };
        }
        return { canUse: true, currentUsage: 0, maxAllowed: 1000, planName: 'Pro' };
      });

      const job = createMockJob();

      await expect(processVideo(job)).rejects.toThrow('LIMIT_EXCEEDED');
    });

    it('should fail when minute limit exceeded', async () => {
      mockCheckUserLimits.mockImplementation(async (userId, type) => {
        if (type === 'minute') {
          return {
            canUse: true,
            currentUsage: 58,
            maxAllowed: 60, // Only 2 minutes remaining
            planName: 'Free',
          };
        }
        return { canUse: true, currentUsage: 0, maxAllowed: 100, planName: 'Free' };
      });

      mockDownloadVideo.mockResolvedValue({
        videoPath: '/tmp/video.mp4',
        metadata: { duration: 300 }, // 5 minute video needs 5 minutes quota
      });

      const job = createMockJob();

      await expect(processVideo(job)).rejects.toThrow('LIMIT_EXCEEDED');
    });

    it('should clamp clip count to available quota', async () => {
      mockCheckUserLimits.mockImplementation(async (userId, type) => {
        if (type === 'clip') {
          return {
            canUse: true,
            currentUsage: 98, // Only 2 clips remaining
            maxAllowed: 100,
            planName: 'Pro',
          };
        }
        return { canUse: true, currentUsage: 0, maxAllowed: 1000, planName: 'Pro' };
      });

      const job = createMockJob({ clipCount: 5 }); // Requesting 5 but only 2 available

      await processVideo(job);

      // Should have updated with clamped clip count
      expect(mockDbJobsUpdate).toHaveBeenCalledWith(
        'job-123',
        expect.objectContaining({ clip_count: 2 })
      );
    });
  });

  describe('pipeline steps', () => {
    it('should call downloadVideo with correct parameters for YouTube', async () => {
      const job = createMockJob({
        sourceType: 'youtube',
        youtubeUrl: 'https://youtube.com/watch?v=abc123',
      });

      await processVideo(job);

      expect(mockDownloadVideo).toHaveBeenCalledWith(
        'youtube',
        'https://youtube.com/watch?v=abc123',
        undefined
      );
    });

    it('should call downloadVideo with correct parameters for upload', async () => {
      const job = createMockJob({
        sourceType: 'upload',
        uploadPath: '/uploads/video.mp4',
        youtubeUrl: undefined,
      });

      await processVideo(job);

      expect(mockDownloadVideo).toHaveBeenCalledWith(
        'upload',
        undefined,
        '/uploads/video.mp4'
      );
    });

    it('should call transcribeVideo after download', async () => {
      const job = createMockJob();

      await processVideo(job);

      expect(mockTranscribeVideo).toHaveBeenCalledWith(
        '/tmp/video.mp4',
        expect.objectContaining({
          language: 'pt',
          model: 'whisper-1',
        })
      );
    });

    it('should call analyzeHighlights with transcript', async () => {
      const job = createMockJob();

      await processVideo(job);

      expect(mockAnalyzeHighlights).toHaveBeenCalledWith(
        expect.objectContaining({
          segments: expect.any(Array),
        }),
        expect.objectContaining({
          targetDuration: 60,
        })
      );
    });

    it('should use auto clipping when aiClipping is disabled', async () => {
      const job = createMockJob({ aiClipping: false });

      await processVideo(job);

      expect(mockGenerateAutoClips).toHaveBeenCalledWith(
        expect.objectContaining({
          segments: expect.any(Array),
        }),
        expect.objectContaining({
          targetDuration: 60,
        })
      );
      expect(mockAnalyzeHighlights).not.toHaveBeenCalled();
    });

    it('should call renderClips after analysis', async () => {
      const job = createMockJob();

      await processVideo(job);

      expect(mockRenderClips).toHaveBeenCalled();
    });

    it('should disable subtitles in render when subtitle preferences set enabled=false', async () => {
      mockRedis.get.mockImplementation(async (key: string) => {
        if (key === 'subtitle:job-123:global') {
          return JSON.stringify({
            enabled: false,
            font: 'Inter',
          });
        }
        return null;
      });

      const job = createMockJob();

      await processVideo(job);

      expect(mockRenderClips).toHaveBeenCalledWith(
        '/tmp/video.mp4',
        expect.any(Array),
        expect.objectContaining({
          segments: expect.any(Array),
        }),
        expect.objectContaining({
          addSubtitles: false,
        })
      );
    });

    it('should upload rendered clips to storage', async () => {
      const job = createMockJob();

      await processVideo(job);

      expect(mockUploadFile).toHaveBeenCalled();
    });

    it('should save clips to database', async () => {
      const job = createMockJob();

      await processVideo(job);

      expect(mockDbClipsUpsert).toHaveBeenCalled();
    });
  });

  describe('progress updates', () => {
    it('should update job progress during processing', async () => {
      const job = createMockJob();

      await processVideo(job);

      expect(job.updateProgress).toHaveBeenCalled();
      // Redis is used for caching/state, not pub/sub in this implementation
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should update job status in database', async () => {
      const job = createMockJob();

      await processVideo(job);

      expect(mockDbJobsUpdate).toHaveBeenCalledWith(
        'job-123',
        expect.objectContaining({ status: 'completed' })
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup temp files on success', async () => {
      const job = createMockJob();

      await processVideo(job);

      expect(mockCleanupVideo).toHaveBeenCalled();
      expect(mockCleanupAudio).toHaveBeenCalled();
      expect(mockCleanupRenderDir).toHaveBeenCalled();
    });

    it('should cleanup temp files on error', async () => {
      mockAnalyzeHighlights.mockRejectedValue(new Error('Analysis failed'));

      const job = createMockJob();

      await expect(processVideo(job)).rejects.toThrow();

      expect(mockCleanupVideo).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should update job status to failed on error', async () => {
      mockDownloadVideo.mockRejectedValue(new Error('Download failed'));

      const job = createMockJob();

      await expect(processVideo(job)).rejects.toThrow('Download failed');

      expect(mockDbJobsUpdate).toHaveBeenCalledWith(
        'job-123',
        expect.objectContaining({
          status: 'failed',
          error: expect.stringContaining('Download failed'),
        })
      );
    });

    it('should handle transcription errors', async () => {
      mockTranscribeVideo.mockRejectedValue(new Error('Whisper API error'));

      const job = createMockJob();

      await expect(processVideo(job)).rejects.toThrow('Whisper API error');
    });

    it('should handle rendering errors', async () => {
      mockRenderClips.mockRejectedValue(new Error('FFmpeg error'));

      const job = createMockJob();

      await expect(processVideo(job)).rejects.toThrow('FFmpeg error');
    });
  });

  describe('usage tracking', () => {
    it('should increment usage after successful processing', async () => {
      const job = createMockJob();

      await processVideo(job);

      expect(mockIncrementUsage).toHaveBeenCalledWith(
        'user-123',
        'minute',
        expect.any(Number),
        'job-123',
        'job',
        expect.any(String)
      );
    });
  });

  describe('job data handling', () => {
    it('should handle duplicate job insert gracefully', async () => {
      mockDbJobsInsert.mockRejectedValueOnce(new Error('duplicate key value'));

      const job = createMockJob();

      await processVideo(job);

      expect(mockDbJobsUpdate).toHaveBeenCalled();
    });

    it('should use default clip settings when not provided', async () => {
      const job = createMockJob({ clipCount: 0 });

      await processVideo(job);

      expect(mockAnalyzeHighlights).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          clipCount: expect.any(Number),
        })
      );
    });

    it('should auto scale clip count above 10 for long videos', async () => {
      mockDownloadVideo.mockResolvedValue({
        videoPath: '/tmp/video.mp4',
        metadata: {
          duration: 3000, // 50 minutos
          width: 1920,
          height: 1080,
          title: 'Long Test Video',
        },
      });

      const job = createMockJob({ clipCount: 0, targetDuration: 45 });

      await processVideo(job);

      const analyzeCall = mockAnalyzeHighlights.mock.calls[0];
      expect(analyzeCall).toBeTruthy();

      const analysisOptions = analyzeCall[1];
      expect(analysisOptions.clipCount).toBeGreaterThan(10);

      const autoClipCountPersisted = mockDbJobsUpdate.mock.calls.some(
        ([jobId, payload]) =>
          jobId === 'job-123' &&
          payload &&
          typeof payload.clip_count === 'number' &&
          payload.clip_count > 10
      );
      expect(autoClipCountPersisted).toBe(true);
    });
  });
});
