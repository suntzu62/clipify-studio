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
    target_duration?: number;
    clip_count?: number;
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
    if (data.target_duration !== undefined) {
      fields.push(`target_duration = $${paramCount++}`);
      values.push(data.target_duration);
    }
    if (data.clip_count !== undefined) {
      fields.push(`clip_count = $${paramCount++}`);
      values.push(data.clip_count);
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

  async findByUserId(userId: string, limit: number = 50, offset: number = 0) {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    return result.rows;
  },

  async countByUserId(userId: string) {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS total FROM jobs WHERE user_id = $1',
      [userId]
    );
    return result.rows[0].total as number;
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
    seo_title?: string;
    seo_description?: string;
    seo_hashtags?: string[];
    seo_variants?: any;
    seo_selected_index?: number;
    start_time: number;
    end_time: number;
    duration: number;
    video_url: string;
    thumbnail_url?: string;
    storage_path: string;
    thumbnail_storage_path?: string;
    transcript: any;
    ai_score?: number;
    virality_components?: any;
    virality_label?: string;
  }) {
    const result = await pool.query(
      `INSERT INTO clips (
        id, job_id, user_id, title, description, hashtags,
        seo_title, seo_description, seo_hashtags, seo_variants, seo_selected_index,
        start_time, end_time, duration,
        video_url, thumbnail_url, storage_path, thumbnail_storage_path,
        transcript, ai_score, virality_components, virality_label,
        status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'ready', NOW(), NOW())
      RETURNING *`,
      [
        data.id,
        data.job_id,
        data.user_id,
        data.title,
        data.description || null,
        data.hashtags || [],
        data.seo_title || null,
        data.seo_description || null,
        data.seo_hashtags || [],
        data.seo_variants ? JSON.stringify(data.seo_variants) : JSON.stringify([]),
        Number.isFinite(data.seo_selected_index as number) ? (data.seo_selected_index as number) : 0,
        data.start_time,
        data.end_time,
        data.duration,
        data.video_url,
        data.thumbnail_url || null,
        data.storage_path,
        data.thumbnail_storage_path || null,
        JSON.stringify(data.transcript),
        data.ai_score || null,
        data.virality_components ? JSON.stringify(data.virality_components) : null,
        data.virality_label || null,
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
    seo_title?: string;
    seo_description?: string;
    seo_hashtags?: string[];
    seo_variants?: any;
    seo_selected_index?: number;
    start_time: number;
    end_time: number;
    duration: number;
    video_url: string;
    thumbnail_url?: string;
    storage_path: string;
    thumbnail_storage_path?: string;
    transcript: any;
    ai_score?: number;
    virality_components?: any;
    virality_label?: string;
  }) {
    const result = await pool.query(
      `INSERT INTO clips (
        id, job_id, user_id, title, description, hashtags,
        seo_title, seo_description, seo_hashtags, seo_variants, seo_selected_index,
        start_time, end_time, duration,
        video_url, thumbnail_url, storage_path, thumbnail_storage_path,
        transcript, ai_score, virality_components, virality_label,
        status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'ready', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        job_id = EXCLUDED.job_id,
        user_id = EXCLUDED.user_id,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        hashtags = EXCLUDED.hashtags,
        seo_title = EXCLUDED.seo_title,
        seo_description = EXCLUDED.seo_description,
        seo_hashtags = EXCLUDED.seo_hashtags,
        seo_variants = EXCLUDED.seo_variants,
        seo_selected_index = EXCLUDED.seo_selected_index,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        duration = EXCLUDED.duration,
        video_url = EXCLUDED.video_url,
        thumbnail_url = EXCLUDED.thumbnail_url,
        storage_path = EXCLUDED.storage_path,
        thumbnail_storage_path = EXCLUDED.thumbnail_storage_path,
        transcript = EXCLUDED.transcript,
        ai_score = EXCLUDED.ai_score,
        virality_components = EXCLUDED.virality_components,
        virality_label = EXCLUDED.virality_label,
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
        data.seo_title || null,
        data.seo_description || null,
        data.seo_hashtags || [],
        data.seo_variants ? JSON.stringify(data.seo_variants) : JSON.stringify([]),
        Number.isFinite(data.seo_selected_index as number) ? (data.seo_selected_index as number) : 0,
        data.start_time,
        data.end_time,
        data.duration,
        data.video_url,
        data.thumbnail_url || null,
        data.storage_path,
        data.thumbnail_storage_path || null,
        JSON.stringify(data.transcript),
        data.ai_score || null,
        data.virality_components ? JSON.stringify(data.virality_components) : null,
        data.virality_label || null,
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

  async findByUserId(userId: string, limit: number = 50, offset: number = 0) {
    const result = await pool.query(
      'SELECT * FROM clips WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    return result.rows;
  },

  async countByUserId(userId: string) {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS total FROM clips WHERE user_id = $1',
      [userId]
    );
    return result.rows[0].total as number;
  },

  async update(clipId: string, data: {
    title?: string;
    description?: string;
    hashtags?: string[];
    seo_title?: string;
    seo_description?: string;
    seo_hashtags?: string[];
    seo_variants?: any;
    seo_selected_index?: number;
    status?: string;
    user_rating?: number;
    rejection_reason?: string;
    reviewed_at?: Date;
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
    if (data.seo_title !== undefined) {
      fields.push(`seo_title = $${paramCount++}`);
      values.push(data.seo_title);
    }
    if (data.seo_description !== undefined) {
      fields.push(`seo_description = $${paramCount++}`);
      values.push(data.seo_description);
    }
    if (data.seo_hashtags !== undefined) {
      fields.push(`seo_hashtags = $${paramCount++}`);
      values.push(data.seo_hashtags);
    }
    if (data.seo_variants !== undefined) {
      fields.push(`seo_variants = $${paramCount++}`);
      values.push(JSON.stringify(data.seo_variants));
    }
    if (data.seo_selected_index !== undefined) {
      fields.push(`seo_selected_index = $${paramCount++}`);
      values.push(data.seo_selected_index);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.user_rating !== undefined) {
      fields.push(`user_rating = $${paramCount++}`);
      values.push(data.user_rating);
    }
    if (data.rejection_reason !== undefined) {
      fields.push(`rejection_reason = $${paramCount++}`);
      values.push(data.rejection_reason);
    }
    if (data.reviewed_at !== undefined) {
      fields.push(`reviewed_at = $${paramCount++}`);
      values.push(data.reviewed_at);
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

  async findById(clipId: string) {
    const result = await pool.query('SELECT * FROM clips WHERE id = $1', [clipId]);
    return result.rows[0] || null;
  },

  async approveClip(clipId: string, rating?: number) {
    const result = await pool.query(
      `UPDATE clips
       SET status = 'approved',
           user_rating = $2,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [clipId, rating || null]
    );
    return result.rows[0];
  },

  async rejectClip(clipId: string, reason: string) {
    const result = await pool.query(
      `UPDATE clips
       SET status = 'rejected',
           rejection_reason = $2,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [clipId, reason]
    );
    return result.rows[0];
  },

  async getReviewSummary(jobId: string) {
    const result = await pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'pending_review') as pending,
         COUNT(*) FILTER (WHERE status = 'approved') as approved,
         COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
         AVG(ai_score) as average_score
       FROM clips
       WHERE job_id = $1`,
      [jobId]
    );
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
 * Clip feedback operations
 */
export const clipFeedback = {
  async insert(data: {
    clip_id: string;
    user_id: string;
    rating?: number;
    feedback_type: string;
    comment?: string;
  }) {
    const result = await pool.query(
      `INSERT INTO clip_feedback (clip_id, user_id, rating, feedback_type, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [data.clip_id, data.user_id, data.rating || null, data.feedback_type, data.comment || null]
    );
    return result.rows[0];
  },

  async findByClipId(clipId: string) {
    const result = await pool.query(
      'SELECT * FROM clip_feedback WHERE clip_id = $1 ORDER BY created_at DESC',
      [clipId]
    );
    return result.rows;
  },
};

/**
 * User preferences operations
 */
export const userPreferences = {
  async upsert(data: {
    user_id: string;
    preferred_caption_styles?: string[];
    preferred_clip_duration?: number;
    min_ai_score?: number;
    auto_approve_threshold?: number;
  }) {
    const result = await pool.query(
      `INSERT INTO user_preferences (
        user_id, preferred_caption_styles, preferred_clip_duration,
        min_ai_score, auto_approve_threshold, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        preferred_caption_styles = COALESCE($2, user_preferences.preferred_caption_styles),
        preferred_clip_duration = COALESCE($3, user_preferences.preferred_clip_duration),
        min_ai_score = COALESCE($4, user_preferences.min_ai_score),
        auto_approve_threshold = COALESCE($5, user_preferences.auto_approve_threshold),
        updated_at = NOW()
      RETURNING *`,
      [
        data.user_id,
        data.preferred_caption_styles ? JSON.stringify(data.preferred_caption_styles) : null,
        data.preferred_clip_duration || null,
        data.min_ai_score || null,
        data.auto_approve_threshold || null,
      ]
    );
    return result.rows[0];
  },

  async findByUserId(userId: string) {
    const result = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  },
};

/**
 * Scheduled publications operations
 */
export const scheduledPublications = {
  async insert(data: {
    user_id: string;
    clip_id: string;
    platform: 'instagram' | 'youtube' | 'tiktok';
    scheduled_at: Date;
    timezone: string;
    status?: 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
    retry_count?: number;
    last_error?: string | null;
    metadata?: Record<string, unknown>;
    idempotency_key?: string;
    publication_url?: string | null;
    published_at?: Date | null;
  }) {
    const result = await pool.query(
      `INSERT INTO scheduled_publications (
        user_id, clip_id, platform, scheduled_at, timezone, status, retry_count,
        last_error, metadata, idempotency_key, publication_url, published_at,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        NOW(), NOW()
      ) RETURNING *`,
      [
        data.user_id,
        data.clip_id,
        data.platform,
        data.scheduled_at,
        data.timezone,
        data.status || 'scheduled',
        data.retry_count ?? 0,
        data.last_error || null,
        JSON.stringify(data.metadata || {}),
        data.idempotency_key || null,
        data.publication_url || null,
        data.published_at || null,
      ]
    );
    return result.rows[0];
  },

  async findById(id: string) {
    const result = await pool.query(
      `SELECT * FROM scheduled_publications WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByIdForUser(id: string, userId: string) {
    const result = await pool.query(
      `SELECT * FROM scheduled_publications WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  async findByUserId(userId: string, limit: number = 100, offset: number = 0) {
    const result = await pool.query(
      `SELECT * FROM scheduled_publications
       WHERE user_id = $1
       ORDER BY scheduled_at ASC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  },

  async findDue(now: Date, limit: number = 50) {
    const result = await pool.query(
      `SELECT * FROM scheduled_publications
       WHERE status = 'scheduled'
         AND scheduled_at <= $1
       ORDER BY scheduled_at ASC
       LIMIT $2`,
      [now, limit]
    );
    return result.rows;
  },

  async update(id: string, data: {
    scheduled_at?: Date;
    timezone?: string;
    status?: 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
    retry_count?: number;
    last_error?: string | null;
    metadata?: Record<string, unknown>;
    publication_url?: string | null;
    published_at?: Date | null;
  }) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.scheduled_at !== undefined) {
      fields.push(`scheduled_at = $${paramCount++}`);
      values.push(data.scheduled_at);
    }
    if (data.timezone !== undefined) {
      fields.push(`timezone = $${paramCount++}`);
      values.push(data.timezone);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.retry_count !== undefined) {
      fields.push(`retry_count = $${paramCount++}`);
      values.push(data.retry_count);
    }
    if (data.last_error !== undefined) {
      fields.push(`last_error = $${paramCount++}`);
      values.push(data.last_error);
    }
    if (data.metadata !== undefined) {
      fields.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(data.metadata || {}));
    }
    if (data.publication_url !== undefined) {
      fields.push(`publication_url = $${paramCount++}`);
      values.push(data.publication_url);
    }
    if (data.published_at !== undefined) {
      fields.push(`published_at = $${paramCount++}`);
      values.push(data.published_at);
    }

    if (!fields.length) {
      return this.findById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE scheduled_publications
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },
};

/**
 * Brand kit operations
 */
export const brandKits = {
  async insert(data: {
    user_id: string;
    name: string;
    logo_url?: string | null;
    intro_url?: string | null;
    outro_url?: string | null;
    palette?: Record<string, unknown>;
    watermark?: Record<string, unknown>;
    caption_style_id?: string | null;
    is_default?: boolean;
  }) {
    const result = await pool.query(
      `INSERT INTO brand_kits (
        user_id, name, logo_url, intro_url, outro_url,
        palette, watermark, caption_style_id, is_default,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        NOW(), NOW()
      ) RETURNING *`,
      [
        data.user_id,
        data.name,
        data.logo_url || null,
        data.intro_url || null,
        data.outro_url || null,
        JSON.stringify(data.palette || {}),
        JSON.stringify(data.watermark || {}),
        data.caption_style_id || null,
        data.is_default === true,
      ]
    );
    return result.rows[0];
  },

  async findByIdForUser(id: string, userId: string) {
    const result = await pool.query(
      `SELECT * FROM brand_kits WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  async findByUserId(userId: string) {
    const result = await pool.query(
      `SELECT * FROM brand_kits WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async setDefault(id: string, userId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE brand_kits SET is_default = false, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
      const result = await client.query(
        `UPDATE brand_kits SET is_default = true, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, userId]
      );
      await client.query('COMMIT');
      return result.rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async update(id: string, userId: string, data: {
    name?: string;
    logo_url?: string | null;
    intro_url?: string | null;
    outro_url?: string | null;
    palette?: Record<string, unknown>;
    watermark?: Record<string, unknown>;
    caption_style_id?: string | null;
    is_default?: boolean;
  }) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name);
    }
    if (data.logo_url !== undefined) {
      fields.push(`logo_url = $${paramCount++}`);
      values.push(data.logo_url);
    }
    if (data.intro_url !== undefined) {
      fields.push(`intro_url = $${paramCount++}`);
      values.push(data.intro_url);
    }
    if (data.outro_url !== undefined) {
      fields.push(`outro_url = $${paramCount++}`);
      values.push(data.outro_url);
    }
    if (data.palette !== undefined) {
      fields.push(`palette = $${paramCount++}`);
      values.push(JSON.stringify(data.palette || {}));
    }
    if (data.watermark !== undefined) {
      fields.push(`watermark = $${paramCount++}`);
      values.push(JSON.stringify(data.watermark || {}));
    }
    if (data.caption_style_id !== undefined) {
      fields.push(`caption_style_id = $${paramCount++}`);
      values.push(data.caption_style_id);
    }
    if (data.is_default !== undefined) {
      fields.push(`is_default = $${paramCount++}`);
      values.push(data.is_default);
    }

    if (!fields.length) {
      return this.findByIdForUser(id, userId);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id, userId);

    const result = await pool.query(
      `UPDATE brand_kits
       SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND user_id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async remove(id: string, userId: string) {
    const result = await pool.query(
      `DELETE FROM brand_kits WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  },
};

/**
 * Live sources operations
 */
export const liveSources = {
  async insert(data: {
    user_id: string;
    platform: 'youtube_live' | 'twitch';
    stream_url: string;
    status?: 'idle' | 'active' | 'stopped' | 'error';
  }) {
    const result = await pool.query(
      `INSERT INTO live_sources (
        user_id, platform, stream_url, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *`,
      [
        data.user_id,
        data.platform,
        data.stream_url,
        data.status || 'idle',
      ]
    );
    return result.rows[0];
  },

  async findByUserId(userId: string) {
    const result = await pool.query(
      `SELECT * FROM live_sources WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async findActive(limit: number = 100) {
    const result = await pool.query(
      `SELECT * FROM live_sources WHERE status = 'active' ORDER BY updated_at ASC LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  async findByIdForUser(id: string, userId: string) {
    const result = await pool.query(
      `SELECT * FROM live_sources WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  async update(id: string, userId: string, data: {
    status?: 'idle' | 'active' | 'stopped' | 'error';
    started_at?: Date | null;
    stopped_at?: Date | null;
    last_ingested_at?: Date | null;
  }) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.started_at !== undefined) {
      fields.push(`started_at = $${paramCount++}`);
      values.push(data.started_at);
    }
    if (data.stopped_at !== undefined) {
      fields.push(`stopped_at = $${paramCount++}`);
      values.push(data.stopped_at);
    }
    if (data.last_ingested_at !== undefined) {
      fields.push(`last_ingested_at = $${paramCount++}`);
      values.push(data.last_ingested_at);
    }

    if (!fields.length) {
      return this.findByIdForUser(id, userId);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id, userId);

    const result = await pool.query(
      `UPDATE live_sources
       SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND user_id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },
};

/**
 * Live ingest windows operations
 */
export const liveIngestWindows = {
  async insert(data: {
    source_id: string;
    user_id: string;
    window_start: Date;
    window_end: Date;
    status?: 'pending' | 'processing' | 'processed' | 'failed';
    job_id?: string | null;
    error?: string | null;
  }) {
    const result = await pool.query(
      `INSERT INTO live_ingest_windows (
        source_id, user_id, window_start, window_end, status, job_id, error, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
      ) RETURNING *`,
      [
        data.source_id,
        data.user_id,
        data.window_start,
        data.window_end,
        data.status || 'pending',
        data.job_id || null,
        data.error || null,
      ]
    );
    return result.rows[0];
  },

  async findBySourceId(sourceId: string, userId: string, limit: number = 50) {
    const result = await pool.query(
      `SELECT * FROM live_ingest_windows
       WHERE source_id = $1 AND user_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [sourceId, userId, limit]
    );
    return result.rows;
  },

  async update(id: string, data: {
    status?: 'pending' | 'processing' | 'processed' | 'failed';
    job_id?: string | null;
    error?: string | null;
  }) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.job_id !== undefined) {
      fields.push(`job_id = $${paramCount++}`);
      values.push(data.job_id);
    }
    if (data.error !== undefined) {
      fields.push(`error = $${paramCount++}`);
      values.push(data.error);
    }

    if (!fields.length) {
      return null;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE live_ingest_windows
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },
};

/**
 * Queue events operations
 */
export const queueEvents = {
  async insert(data: {
    user_id: string;
    queue_name: string;
    entity_type: string;
    entity_id: string;
    event_type: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    payload?: Record<string, unknown>;
  }) {
    const result = await pool.query(
      `INSERT INTO queue_events (
        user_id, queue_name, entity_type, entity_id, event_type, status, payload, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW()
      ) RETURNING *`,
      [
        data.user_id,
        data.queue_name,
        data.entity_type,
        data.entity_id,
        data.event_type,
        data.status,
        JSON.stringify(data.payload || {}),
      ]
    );
    return result.rows[0];
  },

  async listByUserId(userId: string, limit: number = 100) {
    const result = await pool.query(
      `SELECT * FROM queue_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
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
