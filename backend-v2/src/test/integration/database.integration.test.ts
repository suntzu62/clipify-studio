import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Integration tests for database service operations.
 * These tests verify the database layer with mocked pg pool.
 */

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
vi.mock('../../config/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock env
vi.mock('../../config/env.js', () => ({
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
} from '../../services/database.service.js';
import {
  createJobFixture,
  createClipFixture,
  createClipsForJob,
} from '../fixtures/jobs.fixture.js';

describe('Database Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Jobs CRUD Operations', () => {
    it('should create and retrieve a job', async () => {
      const jobData = {
        id: 'job-crud-test',
        user_id: 'user-123',
        source_type: 'youtube',
        youtube_url: 'https://youtube.com/watch?v=test',
        status: 'pending',
      };

      // Insert
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...jobData, created_at: new Date(), updated_at: new Date() }],
      });

      const insertedJob = await jobs.insert(jobData);
      expect(insertedJob.id).toBe('job-crud-test');

      // Find by ID
      mockQuery.mockResolvedValueOnce({
        rows: [insertedJob],
      });

      const foundJob = await jobs.findById('job-crud-test');
      expect(foundJob?.id).toBe('job-crud-test');
      expect(foundJob?.source_type).toBe('youtube');
    });

    it('should update job status through processing stages', async () => {
      const jobId = 'job-stages-test';

      // Pending → Processing
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: jobId, status: 'processing', progress: 0 }],
      });

      let job = await jobs.update(jobId, {
        status: 'processing',
        progress: 0,
        current_step: 'ingest',
      });
      expect(job.status).toBe('processing');

      // Processing → Completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: jobId, status: 'completed', progress: 100 }],
      });

      job = await jobs.update(jobId, {
        status: 'completed',
        progress: 100,
        completed_at: new Date(),
      });
      expect(job.status).toBe('completed');
      expect(job.progress).toBe(100);
    });

    it('should handle job failure', async () => {
      const jobId = 'job-fail-test';

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: jobId,
          status: 'failed',
          error: 'Download failed: video unavailable',
        }],
      });

      const job = await jobs.update(jobId, {
        status: 'failed',
        error: 'Download failed: video unavailable',
      });

      expect(job.status).toBe('failed');
      expect(job.error).toContain('Download failed');
    });

    it('should list jobs by user', async () => {
      const userId = 'user-list-test';
      const userJobs = [
        createJobFixture({ user_id: userId, id: 'job-1' }),
        createJobFixture({ user_id: userId, id: 'job-2' }),
        createJobFixture({ user_id: userId, id: 'job-3' }),
      ];

      mockQuery.mockResolvedValueOnce({ rows: userJobs });

      const result = await jobs.findByUserId(userId);

      expect(result).toHaveLength(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        [userId]
      );
    });

    it('should delete job', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await jobs.delete('job-delete-test');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM jobs'),
        ['job-delete-test']
      );
    });
  });

  describe('Clips CRUD Operations', () => {
    it('should create and retrieve clips for a job', async () => {
      const jobId = 'job-clips-test';
      const clipData = {
        id: 'clip-1',
        job_id: jobId,
        user_id: 'user-123',
        title: 'Test Clip',
        start_time: 0,
        end_time: 60,
        duration: 60,
        video_url: 'https://example.com/clip.mp4',
        storage_path: 'clips/clip.mp4',
        transcript: { segments: [] },
        ai_score: 85,
      };

      // Insert
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...clipData, status: 'ready' }],
      });

      const insertedClip = await clips.insert(clipData);
      expect(insertedClip.status).toBe('ready');

      // Find by job
      mockQuery.mockResolvedValueOnce({
        rows: [insertedClip],
      });

      const jobClips = await clips.findByJobId(jobId);
      expect(jobClips).toHaveLength(1);
    });

    it('should upsert clip (insert or update)', async () => {
      const clipData = {
        id: 'clip-upsert-test',
        job_id: 'job-123',
        user_id: 'user-123',
        title: 'Original Title',
        start_time: 0,
        end_time: 30,
        duration: 30,
        video_url: 'https://example.com/clip.mp4',
        storage_path: 'clips/clip.mp4',
        transcript: { segments: [] },
      };

      // First upsert (insert)
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...clipData, status: 'ready' }],
      });

      let clip = await clips.upsert(clipData);
      expect(clip.title).toBe('Original Title');

      // Second upsert (update)
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...clipData, title: 'Updated Title', status: 'ready' }],
      });

      clip = await clips.upsert({ ...clipData, title: 'Updated Title' });
      expect(clip.title).toBe('Updated Title');

      // Verify ON CONFLICT was used
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      );
    });

    it('should approve and reject clips', async () => {
      const clipId = 'clip-review-test';

      // Approve
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: clipId,
          status: 'approved',
          user_rating: 5,
          reviewed_at: new Date(),
        }],
      });

      let clip = await clips.approveClip(clipId, 5);
      expect(clip.status).toBe('approved');
      expect(clip.user_rating).toBe(5);

      // Reject another clip
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'clip-reject-test',
          status: 'rejected',
          rejection_reason: 'Poor audio quality',
          reviewed_at: new Date(),
        }],
      });

      clip = await clips.rejectClip('clip-reject-test', 'Poor audio quality');
      expect(clip.status).toBe('rejected');
      expect(clip.rejection_reason).toBe('Poor audio quality');
    });

    it('should get review summary for job', async () => {
      const jobId = 'job-summary-test';

      mockQuery.mockResolvedValueOnce({
        rows: [{
          total: '10',
          pending: '2',
          approved: '6',
          rejected: '2',
          average_score: '82.5',
        }],
      });

      const summary = await clips.getReviewSummary(jobId);

      expect(summary.total).toBe('10');
      expect(summary.approved).toBe('6');
      expect(summary.rejected).toBe('2');
      expect(summary.average_score).toBe('82.5');
    });

    it('should delete clips by job', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });

      await clips.deleteByJobId('job-delete-clips-test');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM clips WHERE job_id'),
        ['job-delete-clips-test']
      );
    });
  });

  describe('Clip Feedback Operations', () => {
    it('should record and retrieve feedback', async () => {
      const feedback = {
        clip_id: 'clip-feedback-test',
        user_id: 'user-123',
        rating: 4,
        feedback_type: 'approve',
        comment: 'Great clip!',
      };

      // Insert
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'feedback-1', ...feedback }],
      });

      const insertedFeedback = await clipFeedback.insert(feedback);
      expect(insertedFeedback.rating).toBe(4);

      // Find by clip
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'feedback-1', ...feedback },
          { id: 'feedback-2', clip_id: 'clip-feedback-test', feedback_type: 'edit' },
        ],
      });

      const feedbackList = await clipFeedback.findByClipId('clip-feedback-test');
      expect(feedbackList).toHaveLength(2);
    });
  });

  describe('User Preferences Operations', () => {
    it('should upsert user preferences', async () => {
      const prefs = {
        user_id: 'user-prefs-test',
        preferred_clip_duration: 45,
        min_ai_score: 75,
        auto_approve_threshold: 85,
      };

      // First upsert
      mockQuery.mockResolvedValueOnce({ rows: [prefs] });

      let result = await userPreferences.upsert(prefs);
      expect(result.preferred_clip_duration).toBe(45);

      // Update
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...prefs, min_ai_score: 80 }],
      });

      result = await userPreferences.upsert({
        user_id: 'user-prefs-test',
        min_ai_score: 80,
      });
      expect(result.min_ai_score).toBe(80);
    });

    it('should find preferences by user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-find-prefs',
          preferred_clip_duration: 60,
          min_ai_score: 70,
        }],
      });

      const prefs = await userPreferences.findByUserId('user-find-prefs');

      expect(prefs?.preferred_clip_duration).toBe(60);
    });

    it('should return null when preferences not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const prefs = await userPreferences.findByUserId('user-no-prefs');

      expect(prefs).toBeNull();
    });
  });

  describe('Database Connection', () => {
    it('should test connection successfully', async () => {
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

  describe('Transaction-like Operations', () => {
    it('should handle job with clips creation workflow', async () => {
      const jobId = 'job-workflow-test';
      const userId = 'user-workflow';

      // Create job
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: jobId,
          user_id: userId,
          status: 'processing',
        }],
      });

      const job = await jobs.insert({
        id: jobId,
        user_id: userId,
        source_type: 'youtube',
        status: 'processing',
      });

      // Create multiple clips for the job
      const clipCount = 3;
      for (let i = 0; i < clipCount; i++) {
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: `clip-${i}`,
            job_id: jobId,
            status: 'ready',
          }],
        });
      }

      const createdClips = [];
      for (let i = 0; i < clipCount; i++) {
        const clip = await clips.upsert({
          id: `clip-${i}`,
          job_id: jobId,
          user_id: userId,
          title: `Clip ${i + 1}`,
          start_time: i * 60,
          end_time: (i + 1) * 60,
          duration: 60,
          video_url: `https://example.com/clip-${i}.mp4`,
          storage_path: `clips/clip-${i}.mp4`,
          transcript: { segments: [] },
        });
        createdClips.push(clip);
      }

      expect(createdClips).toHaveLength(3);

      // Complete job
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: jobId, status: 'completed' }],
      });

      const completedJob = await jobs.update(jobId, {
        status: 'completed',
        progress: 100,
        completed_at: new Date(),
      });

      expect(completedJob.status).toBe('completed');
    });
  });
});
