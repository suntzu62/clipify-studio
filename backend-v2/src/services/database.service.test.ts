import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted for variables used in mock factories
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

// Mock pg Pool
vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: mockQuery,
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  })),
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

// Mock env
vi.mock('../config/env.js', () => ({
  env: {
    databaseUrl: 'postgresql://test:test@localhost:5432/test',
  },
}));

import {
  jobs,
  clips,
  clipFeedback,
  userPreferences,
  testConnection,
} from './database.service.js';
import { createJobFixture, createClipFixture, createClipFeedbackFixture } from '../test/fixtures/jobs.fixture.js';

describe('database.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('jobs', () => {
    describe('insert', () => {
      it('should insert a new job', async () => {
        const jobData = {
          id: 'job-123',
          user_id: 'user-123',
          source_type: 'youtube',
          youtube_url: 'https://youtube.com/watch?v=test',
          status: 'pending',
        };

        mockQuery.mockResolvedValueOnce({
          rows: [{ ...jobData, created_at: new Date(), updated_at: new Date() }],
        });

        const result = await jobs.insert(jobData);

        expect(result.id).toBe('job-123');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO jobs'),
          expect.arrayContaining([jobData.id, jobData.user_id, jobData.source_type])
        );
      });

      it('should handle optional fields', async () => {
        const jobData = {
          id: 'job-123',
          user_id: 'user-123',
          source_type: 'upload',
          upload_path: '/uploads/video.mp4',
          target_duration: 60,
          clip_count: 5,
          status: 'pending',
        };

        mockQuery.mockResolvedValueOnce({ rows: [jobData] });

        await jobs.insert(jobData);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([60, 5])
        );
      });
    });

    describe('update', () => {
      it('should update job status', async () => {
        const jobId = 'job-123';
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: jobId, status: 'processing' }],
        });

        const result = await jobs.update(jobId, { status: 'processing' });

        expect(result.status).toBe('processing');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE jobs'),
          expect.arrayContaining(['processing', jobId])
        );
      });

      it('should update multiple fields at once', async () => {
        const jobId = 'job-123';
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: jobId,
            status: 'processing',
            progress: 50,
            current_step: 'transcribe',
          }],
        });

        await jobs.update(jobId, {
          status: 'processing',
          progress: 50,
          current_step: 'transcribe',
          current_step_message: 'Transcribing audio...',
        });

        expect(mockQuery).toHaveBeenCalled();
        const query = mockQuery.mock.calls[0][0];
        expect(query).toContain('status');
        expect(query).toContain('progress');
        expect(query).toContain('current_step');
      });

      it('should update job on completion', async () => {
        const jobId = 'job-123';
        const completedAt = new Date();
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: jobId, status: 'completed' }],
        });

        await jobs.update(jobId, {
          status: 'completed',
          progress: 100,
          completed_at: completedAt,
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('completed_at'),
          expect.arrayContaining([completedAt, jobId])
        );
      });

      it('should update error field on failure', async () => {
        const jobId = 'job-123';
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: jobId, status: 'failed' }],
        });

        await jobs.update(jobId, {
          status: 'failed',
          error: 'Download failed: video unavailable',
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('error'),
          expect.arrayContaining(['Download failed: video unavailable'])
        );
      });
    });

    describe('findById', () => {
      it('should return job when found', async () => {
        const job = createJobFixture({ id: 'job-123' });
        mockQuery.mockResolvedValueOnce({ rows: [job] });

        const result = await jobs.findById('job-123');

        expect(result).toEqual(job);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT * FROM jobs WHERE id'),
          ['job-123']
        );
      });

      it('should return null when job not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await jobs.findById('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('findByUserId', () => {
      it('should return all jobs for user', async () => {
        const userJobs = [
          createJobFixture({ id: 'job-1', user_id: 'user-123' }),
          createJobFixture({ id: 'job-2', user_id: 'user-123' }),
        ];
        mockQuery.mockResolvedValueOnce({ rows: userJobs });

        const result = await jobs.findByUserId('user-123');

        expect(result).toHaveLength(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY created_at DESC'),
          ['user-123']
        );
      });

      it('should return empty array when no jobs found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await jobs.findByUserId('user-without-jobs');

        expect(result).toEqual([]);
      });
    });

    describe('delete', () => {
      it('should delete job by id', async () => {
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        await jobs.delete('job-123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM jobs WHERE id'),
          ['job-123']
        );
      });
    });
  });

  describe('clips', () => {
    describe('insert', () => {
      it('should insert a new clip', async () => {
        const clipData = {
          id: 'clip-123',
          job_id: 'job-123',
          user_id: 'user-123',
          title: 'Test Clip',
          start_time: 0,
          end_time: 60,
          duration: 60,
          video_url: 'https://storage.example.com/clip.mp4',
          storage_path: 'clips/clip.mp4',
          transcript: { segments: [] },
        };

        mockQuery.mockResolvedValueOnce({
          rows: [{ ...clipData, status: 'ready' }],
        });

        const result = await clips.insert(clipData);

        expect(result.id).toBe('clip-123');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO clips'),
          expect.arrayContaining([clipData.id, clipData.job_id])
        );
      });

      it('should handle all optional fields', async () => {
        const clipData = {
          id: 'clip-123',
          job_id: 'job-123',
          user_id: 'user-123',
          title: 'Full Clip',
          description: 'A full clip description',
          hashtags: ['test', 'clip'],
          seo_title: 'SEO Title',
          seo_description: 'SEO Description',
          seo_hashtags: ['seo', 'optimized'],
          seo_variants: [{ title: 'variant1' }],
          seo_selected_index: 0,
          start_time: 10,
          end_time: 70,
          duration: 60,
          video_url: 'https://example.com/clip.mp4',
          thumbnail_url: 'https://example.com/thumb.jpg',
          storage_path: 'clips/clip.mp4',
          thumbnail_storage_path: 'clips/thumb.jpg',
          transcript: { segments: [] },
          ai_score: 85,
          virality_components: { hook: 90, engagement: 80 },
          virality_label: 'high',
        };

        mockQuery.mockResolvedValueOnce({ rows: [clipData] });

        await clips.insert(clipData);

        expect(mockQuery).toHaveBeenCalled();
      });
    });

    describe('upsert', () => {
      it('should insert or update clip', async () => {
        const clipData = {
          id: 'clip-123',
          job_id: 'job-123',
          user_id: 'user-123',
          title: 'Updated Clip',
          start_time: 0,
          end_time: 60,
          duration: 60,
          video_url: 'https://example.com/clip.mp4',
          storage_path: 'clips/clip.mp4',
          transcript: { segments: [] },
        };

        mockQuery.mockResolvedValueOnce({ rows: [clipData] });

        await clips.upsert(clipData);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('ON CONFLICT (id) DO UPDATE'),
          expect.any(Array)
        );
      });
    });

    describe('findByJobId', () => {
      it('should return clips ordered by start_time', async () => {
        const jobClips = [
          createClipFixture({ start_time: 0 }),
          createClipFixture({ start_time: 60 }),
        ];
        mockQuery.mockResolvedValueOnce({ rows: jobClips });

        const result = await clips.findByJobId('job-123');

        expect(result).toHaveLength(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY start_time ASC'),
          ['job-123']
        );
      });
    });

    describe('findByUserId', () => {
      it('should return clips ordered by created_at', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await clips.findByUserId('user-123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY created_at DESC'),
          ['user-123']
        );
      });
    });

    describe('update', () => {
      it('should update clip title and description', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'clip-123', title: 'New Title' }],
        });

        await clips.update('clip-123', {
          title: 'New Title',
          description: 'New description',
        });

        const query = mockQuery.mock.calls[0][0];
        expect(query).toContain('title');
        expect(query).toContain('description');
      });

      it('should update SEO fields', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'clip-123' }] });

        await clips.update('clip-123', {
          seo_title: 'SEO Title',
          seo_description: 'SEO Desc',
          seo_hashtags: ['tag1', 'tag2'],
          seo_variants: [{ title: 'v1' }],
          seo_selected_index: 1,
        });

        expect(mockQuery).toHaveBeenCalled();
      });

      it('should update review fields', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'clip-123' }] });

        await clips.update('clip-123', {
          status: 'approved',
          user_rating: 5,
          reviewed_at: new Date(),
        });

        const query = mockQuery.mock.calls[0][0];
        expect(query).toContain('status');
        expect(query).toContain('user_rating');
        expect(query).toContain('reviewed_at');
      });
    });

    describe('findById', () => {
      it('should return clip when found', async () => {
        const clip = createClipFixture({ id: 'clip-123' });
        mockQuery.mockResolvedValueOnce({ rows: [clip] });

        const result = await clips.findById('clip-123');

        expect(result).toEqual(clip);
      });

      it('should return null when not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await clips.findById('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('approveClip', () => {
      it('should mark clip as approved with rating', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'clip-123', status: 'approved', user_rating: 5 }],
        });

        const result = await clips.approveClip('clip-123', 5);

        expect(result.status).toBe('approved');
        expect(result.user_rating).toBe(5);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'approved'"),
          ['clip-123', 5]
        );
      });

      it('should approve without rating', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'clip-123', status: 'approved', user_rating: null }],
        });

        await clips.approveClip('clip-123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.any(String),
          ['clip-123', null]
        );
      });
    });

    describe('rejectClip', () => {
      it('should mark clip as rejected with reason', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'clip-123', status: 'rejected', rejection_reason: 'Low quality' }],
        });

        const result = await clips.rejectClip('clip-123', 'Low quality');

        expect(result.status).toBe('rejected');
        expect(result.rejection_reason).toBe('Low quality');
      });
    });

    describe('getReviewSummary', () => {
      it('should return review statistics', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{
            total: '10',
            pending: '3',
            approved: '5',
            rejected: '2',
            average_score: '85.5',
          }],
        });

        const result = await clips.getReviewSummary('job-123');

        expect(result.total).toBe('10');
        expect(result.approved).toBe('5');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('COUNT(*)'),
          ['job-123']
        );
      });
    });

    describe('delete', () => {
      it('should delete clip by id', async () => {
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        await clips.delete('clip-123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM clips WHERE id'),
          ['clip-123']
        );
      });
    });

    describe('deleteByJobId', () => {
      it('should delete all clips for a job', async () => {
        mockQuery.mockResolvedValueOnce({ rowCount: 5 });

        await clips.deleteByJobId('job-123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM clips WHERE job_id'),
          ['job-123']
        );
      });
    });
  });

  describe('clipFeedback', () => {
    describe('insert', () => {
      it('should insert feedback', async () => {
        const feedbackData = {
          clip_id: 'clip-123',
          user_id: 'user-123',
          rating: 5,
          feedback_type: 'approve',
          comment: 'Great clip!',
        };

        mockQuery.mockResolvedValueOnce({ rows: [feedbackData] });

        const result = await clipFeedback.insert(feedbackData);

        expect(result.feedback_type).toBe('approve');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO clip_feedback'),
          expect.arrayContaining([feedbackData.clip_id, feedbackData.user_id])
        );
      });

      it('should handle feedback without rating or comment', async () => {
        const feedbackData = {
          clip_id: 'clip-123',
          user_id: 'user-123',
          feedback_type: 'reject',
        };

        mockQuery.mockResolvedValueOnce({ rows: [feedbackData] });

        await clipFeedback.insert(feedbackData);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([null, null])
        );
      });
    });

    describe('findByClipId', () => {
      it('should return feedback for clip', async () => {
        const feedbacks = [
          createClipFeedbackFixture({ clip_id: 'clip-123' }),
          createClipFeedbackFixture({ clip_id: 'clip-123' }),
        ];
        mockQuery.mockResolvedValueOnce({ rows: feedbacks });

        const result = await clipFeedback.findByClipId('clip-123');

        expect(result).toHaveLength(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY created_at DESC'),
          ['clip-123']
        );
      });
    });
  });

  describe('userPreferences', () => {
    describe('upsert', () => {
      it('should insert new preferences', async () => {
        const prefsData = {
          user_id: 'user-123',
          preferred_caption_styles: ['style1', 'style2'],
          preferred_clip_duration: 60,
          min_ai_score: 70,
          auto_approve_threshold: 85,
        };

        mockQuery.mockResolvedValueOnce({ rows: [prefsData] });

        const result = await userPreferences.upsert(prefsData);

        expect(result.user_id).toBe('user-123');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('ON CONFLICT (user_id) DO UPDATE'),
          expect.any(Array)
        );
      });

      it('should update existing preferences', async () => {
        const prefsData = {
          user_id: 'user-123',
          min_ai_score: 80,
        };

        mockQuery.mockResolvedValueOnce({ rows: [prefsData] });

        await userPreferences.upsert(prefsData);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('COALESCE'),
          expect.any(Array)
        );
      });
    });

    describe('findByUserId', () => {
      it('should return preferences when found', async () => {
        const prefs = {
          user_id: 'user-123',
          preferred_clip_duration: 45,
          min_ai_score: 75,
        };
        mockQuery.mockResolvedValueOnce({ rows: [prefs] });

        const result = await userPreferences.findByUserId('user-123');

        expect(result).toEqual(prefs);
      });

      it('should return null when not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await userPreferences.findByUserId('user-without-prefs');

        expect(result).toBeNull();
      });
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

      const result = await testConnection();

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return false on connection failure', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await testConnection();

      expect(result).toBe(false);
    });
  });
});
