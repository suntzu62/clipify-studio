import { Pool } from 'pg';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import type { Clip } from '../types/index.js';

const logger = createLogger('database');

// PostgreSQL connection pool
export const pool = new Pool({
  connectionString: env.databaseUrl || 'postgresql://postgres:postgres@localhost:5432/cortai_dev',
});

/**
 * Jobs table operations
 */
export const jobs = {
  async insert(data: {
    id: string;
    user_id: string;
    source_type: string;
    youtube_url?: string;
    upload_path?: string;
    target_duration?: number;
    clip_count?: number;
    status: string;
  }) {
    const result = await pool.query(
      `INSERT INTO jobs (id, user_id, source_type, youtube_url, upload_path, target_duration, clip_count, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        data.id,
        data.user_id,
        data.source_type,
        data.youtube_url || null,
        data.upload_path || null,
        data.target_duration || null,
        data.clip_count || null,
        data.status,
      ]
    );
    return result.rows[0];
  },

  async update(jobId: string, data: {
    video_path?: string;
    metadata?: any;
    status?: string;
    error?: string;
    progress?: number;
    current_step?: string;
    current_step_message?: string;
    completed_at?: Date;
    title?: string;
  }) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.video_path !== undefined) {
      fields.push(`video_path = $${paramCount++}`);
      values.push(data.video_path);
    }
    if (data.metadata !== undefined) {
      fields.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(data.metadata));
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.error !== undefined) {
      fields.push(`error = $${paramCount++}`);
      values.push(data.error);
    }
    if (data.progress !== undefined) {
      fields.push(`progress = $${paramCount++}`);
      values.push(data.progress);
    }
    if (data.current_step !== undefined) {
      fields.push(`current_step = $${paramCount++}`);
      values.push(data.current_step);
    }
    if (data.current_step_message !== undefined) {
      fields.push(`current_step_message = $${paramCount++}`);
      values.push(data.current_step_message);
    }
    if (data.completed_at !== undefined) {
      fields.push(`completed_at = $${paramCount++}`);
      values.push(data.completed_at);
    }
    if (data.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(data.title);
    }

    fields.push(`updated_at = NOW()`);
    values.push(jobId);

    const query = `
      UPDATE jobs
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async findById(jobId: string) {
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    return result.rows[0] || null;
  },

  async findByUserId(userId: string) {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  },

  async delete(jobId: string) {
    await pool.query('DELETE FROM jobs WHERE id = $1', [jobId]);
  },
};

/**
 * Clips table operations
 */
export const clips = {
  async insert(data: {
    id: string;
    job_id: string;
    user_id: string;
    title: string;
    description?: string;
    hashtags?: string[];
    start_time: number;
    end_time: number;
    duration: number;
    video_url: string;
    thumbnail_url?: string;
    storage_path: string;
    thumbnail_storage_path?: string;
    transcript: any;
  }) {
    const result = await pool.query(
      `INSERT INTO clips (
        id, job_id, user_id, title, description, hashtags,
        start_time, end_time, duration,
        video_url, thumbnail_url, storage_path, thumbnail_storage_path,
        transcript, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'ready', NOW(), NOW())
      RETURNING *`,
      [
        data.id,
        data.job_id,
        data.user_id,
        data.title,
        data.description || null,
        data.hashtags || [],
        data.start_time,
        data.end_time,
        data.duration,
        data.video_url,
        data.thumbnail_url || null,
        data.storage_path,
        data.thumbnail_storage_path || null,
        JSON.stringify(data.transcript),
      ]
    );
    return result.rows[0];
  },

  async upsert(data: {
    id: string;
    job_id: string;
    user_id: string;
    title: string;
    description?: string;
    hashtags?: string[];
    start_time: number;
    end_time: number;
    duration: number;
    video_url: string;
    thumbnail_url?: string;
    storage_path: string;
    thumbnail_storage_path?: string;
    transcript: any;
  }) {
    const result = await pool.query(
      `INSERT INTO clips (
        id, job_id, user_id, title, description, hashtags,
        start_time, end_time, duration,
        video_url, thumbnail_url, storage_path, thumbnail_storage_path,
        transcript, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'ready', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        job_id = EXCLUDED.job_id,
        user_id = EXCLUDED.user_id,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        hashtags = EXCLUDED.hashtags,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        duration = EXCLUDED.duration,
        video_url = EXCLUDED.video_url,
        thumbnail_url = EXCLUDED.thumbnail_url,
        storage_path = EXCLUDED.storage_path,
        thumbnail_storage_path = EXCLUDED.thumbnail_storage_path,
        transcript = EXCLUDED.transcript,
        status = 'ready',
        updated_at = NOW()
      RETURNING *`,
      [
        data.id,
        data.job_id,
        data.user_id,
        data.title,
        data.description || null,
        data.hashtags || [],
        data.start_time,
        data.end_time,
        data.duration,
        data.video_url,
        data.thumbnail_url || null,
        data.storage_path,
        data.thumbnail_storage_path || null,
        JSON.stringify(data.transcript),
      ]
    );
    return result.rows[0];
  },

  async findByJobId(jobId: string) {
    const result = await pool.query(
      'SELECT * FROM clips WHERE job_id = $1 ORDER BY start_time ASC',
      [jobId]
    );
    return result.rows;
  },

  async findByUserId(userId: string) {
    const result = await pool.query(
      'SELECT * FROM clips WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  },

  async update(clipId: string, data: {
    title?: string;
    description?: string;
    hashtags?: string[];
    status?: string;
  }) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(data.title);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(data.description);
    }
    if (data.hashtags !== undefined) {
      fields.push(`hashtags = $${paramCount++}`);
      values.push(data.hashtags);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }

    fields.push(`updated_at = NOW()`);
    values.push(clipId);

    const query = `
      UPDATE clips
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async delete(clipId: string) {
    await pool.query('DELETE FROM clips WHERE id = $1', [clipId]);
  },

  async deleteByJobId(jobId: string) {
    await pool.query('DELETE FROM clips WHERE job_id = $1', [jobId]);
  },
};

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error({ error }, 'Database connection failed');
    return false;
  }
}
