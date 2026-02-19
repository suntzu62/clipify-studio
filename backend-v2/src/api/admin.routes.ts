import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { requireSuperAdmin } from '../middleware/admin.middleware.js';
import { isSuperAdmin } from '../config/admin.js';
import { pool } from '../services/database.service.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger('admin-routes');

// Middleware chain for admin routes
const adminAuth = [authenticateJWT, requireSuperAdmin];

export async function registerAdminRoutes(app: FastifyInstance) {
  // ============================================
  // ADMIN STATUS CHECK
  // ============================================
  app.get('/admin/status', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const isAdmin = isSuperAdmin(request.user?.email);
    return reply.send({
      isAdmin,
      email: request.user?.email,
    });
  });

  // ============================================
  // DASHBOARD STATS
  // ============================================
  app.get('/admin/stats', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      // Get total counts in parallel
      const [usersResult, jobsResult, clipsResult, subscriptionsResult] = await Promise.all([
        pool.query('SELECT COUNT(*) as count FROM profiles'),
        pool.query('SELECT COUNT(*) as count FROM jobs'),
        pool.query('SELECT COUNT(*) as count FROM clips'),
        pool.query('SELECT COUNT(*) as count FROM subscriptions WHERE status = $1', ['active']),
      ]);

      // Get recent activity
      const [recentJobsResult, jobsByStatusResult] = await Promise.all([
        pool.query(`
          SELECT COUNT(*) as count
          FROM jobs
          WHERE created_at > NOW() - INTERVAL '24 hours'
        `),
        pool.query(`
          SELECT status, COUNT(*) as count
          FROM jobs
          GROUP BY status
        `),
      ]);

      // Get subscription breakdown
      const subscriptionBreakdownResult = await pool.query(`
        SELECT plan_id, COUNT(*) as count
        FROM subscriptions
        WHERE status = 'active'
        GROUP BY plan_id
      `);

      return reply.send({
        totalUsers: parseInt(usersResult.rows[0]?.count || '0'),
        totalJobs: parseInt(jobsResult.rows[0]?.count || '0'),
        totalClips: parseInt(clipsResult.rows[0]?.count || '0'),
        activeSubscriptions: parseInt(subscriptionsResult.rows[0]?.count || '0'),
        recentJobs24h: parseInt(recentJobsResult.rows[0]?.count || '0'),
        jobsByStatus: jobsByStatusResult.rows.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {} as Record<string, number>),
        subscriptionBreakdown: subscriptionBreakdownResult.rows.reduce((acc, row) => {
          acc[row.plan_id || 'free'] = parseInt(row.count);
          return acc;
        }, {} as Record<string, number>),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get admin stats');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch stats',
      });
    }
  });

  // ============================================
  // SYSTEM METRICS
  // ============================================
  app.get('/admin/metrics', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      // Get processing metrics
      const [avgProcessingTime, totalMinutesProcessed] = await Promise.all([
        pool.query(`
          SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_seconds
          FROM jobs
          WHERE status = 'completed' AND completed_at IS NOT NULL
        `),
        pool.query(`
          SELECT COALESCE(SUM(
            CASE
              WHEN metadata->>'duration' IS NOT NULL
              THEN (metadata->>'duration')::numeric / 60
              ELSE 0
            END
          ), 0) as total_minutes
          FROM jobs
          WHERE status = 'completed'
        `),
      ]);

      // Get daily stats for last 7 days
      const dailyStatsResult = await pool.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as jobs_count,
          COUNT(DISTINCT user_id) as unique_users
        FROM jobs
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);

      return reply.send({
        avgProcessingTimeSeconds: parseFloat(avgProcessingTime.rows[0]?.avg_seconds || '0'),
        totalMinutesProcessed: parseFloat(totalMinutesProcessed.rows[0]?.total_minutes || '0'),
        dailyStats: dailyStatsResult.rows.map(row => ({
          date: row.date,
          jobsCount: parseInt(row.jobs_count),
          uniqueUsers: parseInt(row.unique_users),
        })),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get admin metrics');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch metrics',
      });
    }
  });

  // ============================================
  // USERS MANAGEMENT
  // ============================================
  app.get<{
    Querystring: { page?: string; limit?: string; search?: string }
  }>('/admin/users', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page || '1');
      const limit = Math.min(parseInt(request.query.limit || '20'), 100);
      const offset = (page - 1) * limit;
      const search = request.query.search?.trim();

      let query = `
        SELECT
          u.id, u.email, u.full_name, u.avatar_url, u.created_at,
          s.plan_id, s.status as subscription_status,
          (SELECT COUNT(*) FROM jobs WHERE user_id = u.id) as jobs_count
        FROM profiles u
        LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
      `;
      const params: any[] = [];

      if (search) {
        query += ` WHERE u.email ILIKE $1 OR u.full_name ILIKE $1`;
        params.push(`%${search}%`);
      }

      query += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const [usersResult, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(
          `SELECT COUNT(*) as count FROM profiles ${search ? 'WHERE email ILIKE $1 OR full_name ILIKE $1' : ''}`,
          search ? [`%${search}%`] : []
        ),
      ]);

      return reply.send({
        users: usersResult.rows,
        total: parseInt(countResult.rows[0]?.count || '0'),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0]?.count || '0') / limit),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get users');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch users',
      });
    }
  });

  app.get<{
    Params: { id: string }
  }>('/admin/users/:id', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const [userResult, subscriptionResult, jobsResult, clipsResult] = await Promise.all([
        pool.query('SELECT * FROM profiles WHERE id = $1', [id]),
        pool.query('SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [id]),
        pool.query('SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', [id]),
        pool.query('SELECT COUNT(*) as count FROM clips WHERE user_id = $1', [id]),
      ]);

      if (!userResult.rows[0]) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return reply.send({
        user: userResult.rows[0],
        subscription: subscriptionResult.rows[0] || null,
        recentJobs: jobsResult.rows,
        totalClips: parseInt(clipsResult.rows[0]?.count || '0'),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get user details');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch user',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { full_name?: string; email?: string };
  }>('/admin/users/:id', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const schema = z.object({
        full_name: z.string().min(1).optional(),
        email: z.string().email().optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'INVALID_INPUT',
          message: 'Invalid request body',
          details: parsed.error.format(),
        });
      }

      const { full_name, email } = parsed.data;
      const fields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (full_name !== undefined) {
        fields.push(`full_name = $${paramCount++}`);
        values.push(full_name);
      }
      if (email !== undefined) {
        fields.push(`email = $${paramCount++}`);
        values.push(email);
      }

      if (fields.length === 0) {
        return reply.code(400).send({
          error: 'INVALID_INPUT',
          message: 'No fields to update',
        });
      }

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await pool.query(
        `UPDATE profiles SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (!result.rows[0]) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      logger.info({ userId: id, adminId: request.user?.userId }, 'User updated by admin');
      return reply.send({ user: result.rows[0] });
    } catch (error) {
      logger.error({ error }, 'Failed to update user');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to update user',
      });
    }
  });

  app.delete<{
    Params: { id: string }
  }>('/admin/users/:id', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Check if user exists
      const userResult = await pool.query('SELECT id, email FROM profiles WHERE id = $1', [id]);
      if (!userResult.rows[0]) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Prevent self-deletion
      if (id === request.user?.userId) {
        return reply.code(400).send({
          error: 'INVALID_OPERATION',
          message: 'Cannot delete your own account',
        });
      }

      // Delete related data in order (clips -> jobs -> subscriptions -> user)
      await pool.query('DELETE FROM clips WHERE user_id = $1', [id]);
      await pool.query('DELETE FROM jobs WHERE user_id = $1', [id]);
      await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [id]);
      await pool.query('DELETE FROM profiles WHERE id = $1', [id]);

      logger.info({ deletedUserId: id, adminId: request.user?.userId }, 'User deleted by admin');
      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to delete user');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete user',
      });
    }
  });

  // ============================================
  // JOBS MANAGEMENT
  // ============================================
  app.get<{
    Querystring: { page?: string; limit?: string; status?: string; user_id?: string };
  }>('/admin/jobs', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page || '1');
      const limit = Math.min(parseInt(request.query.limit || '20'), 100);
      const offset = (page - 1) * limit;
      const { status, user_id } = request.query;

      let query = `
        SELECT
          j.*,
          u.email as user_email,
          u.full_name as user_name,
          (SELECT COUNT(*) FROM clips WHERE job_id = j.id) as clips_count
        FROM jobs j
        LEFT JOIN profiles u ON u.id = j.user_id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramCount = 1;

      if (status) {
        query += ` AND j.status = $${paramCount++}`;
        params.push(status);
      }
      if (user_id) {
        query += ` AND j.user_id = $${paramCount++}`;
        params.push(user_id);
      }

      // Count query
      let countQuery = 'SELECT COUNT(*) as count FROM jobs WHERE 1=1';
      const countParams: any[] = [];
      let countParamIdx = 1;
      if (status) {
        countQuery += ` AND status = $${countParamIdx++}`;
        countParams.push(status);
      }
      if (user_id) {
        countQuery += ` AND user_id = $${countParamIdx++}`;
        countParams.push(user_id);
      }

      query += ` ORDER BY j.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      params.push(limit, offset);

      const [jobsResult, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, countParams),
      ]);

      return reply.send({
        jobs: jobsResult.rows,
        total: parseInt(countResult.rows[0]?.count || '0'),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0]?.count || '0') / limit),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get jobs');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch jobs',
      });
    }
  });

  app.delete<{
    Params: { id: string }
  }>('/admin/jobs/:id', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Check if job exists
      const jobResult = await pool.query('SELECT id FROM jobs WHERE id = $1', [id]);
      if (!jobResult.rows[0]) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Job not found',
        });
      }

      // Delete clips first, then job
      await pool.query('DELETE FROM clips WHERE job_id = $1', [id]);
      await pool.query('DELETE FROM jobs WHERE id = $1', [id]);

      logger.info({ deletedJobId: id, adminId: request.user?.userId }, 'Job deleted by admin');
      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to delete job');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete job',
      });
    }
  });

  // ============================================
  // CLIPS MANAGEMENT
  // ============================================
  app.get<{
    Querystring: { page?: string; limit?: string; user_id?: string; job_id?: string };
  }>('/admin/clips', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page || '1');
      const limit = Math.min(parseInt(request.query.limit || '20'), 100);
      const offset = (page - 1) * limit;
      const { user_id, job_id } = request.query;

      let query = `
        SELECT
          c.*,
          u.email as user_email,
          j.title as job_title
        FROM clips c
        LEFT JOIN profiles u ON u.id = c.user_id
        LEFT JOIN jobs j ON j.id = c.job_id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramCount = 1;

      if (user_id) {
        query += ` AND c.user_id = $${paramCount++}`;
        params.push(user_id);
      }
      if (job_id) {
        query += ` AND c.job_id = $${paramCount++}`;
        params.push(job_id);
      }

      // Count query
      let countQuery = 'SELECT COUNT(*) as count FROM clips WHERE 1=1';
      const countParams: any[] = [];
      let countParamIdx = 1;
      if (user_id) {
        countQuery += ` AND user_id = $${countParamIdx++}`;
        countParams.push(user_id);
      }
      if (job_id) {
        countQuery += ` AND job_id = $${countParamIdx++}`;
        countParams.push(job_id);
      }

      query += ` ORDER BY c.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      params.push(limit, offset);

      const [clipsResult, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, countParams),
      ]);

      return reply.send({
        clips: clipsResult.rows,
        total: parseInt(countResult.rows[0]?.count || '0'),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0]?.count || '0') / limit),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get clips');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch clips',
      });
    }
  });

  // ============================================
  // SUBSCRIPTIONS MANAGEMENT
  // ============================================
  app.get<{
    Querystring: { page?: string; limit?: string; status?: string; plan_id?: string };
  }>('/admin/subscriptions', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page || '1');
      const limit = Math.min(parseInt(request.query.limit || '20'), 100);
      const offset = (page - 1) * limit;
      const { status, plan_id } = request.query;

      let query = `
        SELECT
          s.*,
          u.email as user_email,
          u.full_name as user_name
        FROM subscriptions s
        LEFT JOIN profiles u ON u.id = s.user_id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramCount = 1;

      if (status) {
        query += ` AND s.status = $${paramCount++}`;
        params.push(status);
      }
      if (plan_id) {
        query += ` AND s.plan_id = $${paramCount++}`;
        params.push(plan_id);
      }

      // Count query
      let countQuery = 'SELECT COUNT(*) as count FROM subscriptions WHERE 1=1';
      const countParams: any[] = [];
      let countParamIdx = 1;
      if (status) {
        countQuery += ` AND status = $${countParamIdx++}`;
        countParams.push(status);
      }
      if (plan_id) {
        countQuery += ` AND plan_id = $${countParamIdx++}`;
        countParams.push(plan_id);
      }

      query += ` ORDER BY s.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      params.push(limit, offset);

      const [subscriptionsResult, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, countParams),
      ]);

      return reply.send({
        subscriptions: subscriptionsResult.rows,
        total: parseInt(countResult.rows[0]?.count || '0'),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0]?.count || '0') / limit),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get subscriptions');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch subscriptions',
      });
    }
  });

	  app.patch<{
	    Params: { id: string };
	    Body: { plan_id?: string; status?: string; current_period_end?: string };
	  }>('/admin/subscriptions/:id', {
	    preHandler: adminAuth,
	  }, async (request, reply) => {
	    try {
	      const { id } = request.params;
	      const schema = z.object({
	        plan_id: z.string().min(1).optional(),
	        status: z.enum(['pending', 'authorized', 'active', 'paused', 'cancelled', 'expired']).optional(),
	        current_period_end: z.string().datetime().optional(),
	      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'INVALID_INPUT',
          message: 'Invalid request body',
          details: parsed.error.format(),
        });
      }

	      const { plan_id, status, current_period_end } = parsed.data;

	      if (plan_id !== undefined) {
	        const planCheck = await pool.query(
	          'SELECT 1 FROM plans WHERE id = $1 LIMIT 1',
	          [plan_id]
	        );
	        if (!planCheck.rows[0]) {
	          return reply.code(400).send({
	            error: 'INVALID_INPUT',
	            message: 'Invalid plan_id',
	          });
	        }
	      }

	      const fields: string[] = [];
	      const values: any[] = [];
	      let paramCount = 1;

      if (plan_id !== undefined) {
        fields.push(`plan_id = $${paramCount++}`);
        values.push(plan_id);
      }
      if (status !== undefined) {
        fields.push(`status = $${paramCount++}`);
        values.push(status);
      }
      if (current_period_end !== undefined) {
        fields.push(`current_period_end = $${paramCount++}`);
        values.push(current_period_end);
      }

      if (fields.length === 0) {
        return reply.code(400).send({
          error: 'INVALID_INPUT',
          message: 'No fields to update',
        });
      }

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await pool.query(
        `UPDATE subscriptions SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (!result.rows[0]) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Subscription not found',
        });
      }

      logger.info({ subscriptionId: id, adminId: request.user?.userId }, 'Subscription updated by admin');
      return reply.send({ subscription: result.rows[0] });
    } catch (error) {
      logger.error({ error }, 'Failed to update subscription');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to update subscription',
      });
    }
  });

	  // Grant a plan to a user (create or update subscription)
	  app.post<{
	    Params: { id: string };
	    Body: { plan_id: string; duration_days?: number };
	  }>('/admin/users/:id/grant-plan', {
	    preHandler: adminAuth,
	  }, async (request, reply) => {
	    try {
	      const { id } = request.params;
	      const schema = z.object({
	        plan_id: z.string().min(1),
	        duration_days: z.number().min(1).default(30),
	      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'INVALID_INPUT',
          message: 'Invalid request body',
          details: parsed.error.format(),
        });
      }

	      const { plan_id, duration_days } = parsed.data;

	      // Validate plan exists (even if inactive, it must exist to satisfy FK).
	      const planCheck = await pool.query('SELECT 1 FROM plans WHERE id = $1 LIMIT 1', [plan_id]);
	      if (!planCheck.rows[0]) {
	        return reply.code(400).send({
	          error: 'INVALID_INPUT',
	          message: 'Invalid plan_id',
	        });
	      }

	      // Check if user exists
	      const userResult = await pool.query('SELECT id, email FROM profiles WHERE id = $1', [id]);
	      if (!userResult.rows[0]) {
	        return reply.code(404).send({
	          error: 'NOT_FOUND',
	          message: 'User not found',
	        });
	      }

      // Calculate period end
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + duration_days);

	      // We keep subscription history: cancel active/pending ones, then insert a new active row.
	      const client = await pool.connect();
	      try {
	        await client.query('BEGIN');

	        await client.query(
	          `
	            UPDATE subscriptions
	            SET status = 'cancelled',
	                cancelled_at = NOW(),
	                cancel_reason = 'admin_grant_plan',
	                updated_at = NOW()
	            WHERE user_id = $1
	              AND status IN ('pending', 'authorized', 'active', 'paused')
	          `,
	          [id]
	        );

	        const result = await client.query(
	          `
	            INSERT INTO subscriptions (
	              user_id, plan_id, status, billing_cycle,
	              current_period_start, current_period_end,
	              created_at, updated_at, is_trial
	            )
	            VALUES ($1, $2, 'active', 'monthly', NOW(), $3, NOW(), NOW(), false)
	            RETURNING *
	          `,
	          [id, plan_id, periodEnd.toISOString()]
	        );

	        await client.query('COMMIT');

	        logger.info(
	          { userId: id, planId: plan_id, durationDays: duration_days, adminId: request.user?.userId },
	          'Plan granted by admin'
	        );

	        return reply.send({
	          subscription: result.rows[0],
	          message: `Plan ${plan_id} granted to user for ${duration_days} days`,
	        });
	      } catch (error) {
	        await client.query('ROLLBACK');
	        throw error;
	      } finally {
	        client.release();
	      }
	    } catch (error) {
	      logger.error({ error }, 'Failed to grant plan');
	      return reply.code(500).send({
	        error: 'INTERNAL_ERROR',
        message: 'Failed to grant plan',
      });
    }
  });

  // ============================================
  // TEMPLATES MANAGEMENT
  // ============================================
  app.get<{
    Querystring: { page?: string; limit?: string };
  }>('/admin/templates', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page || '1');
      const limit = Math.min(parseInt(request.query.limit || '20'), 100);
      const offset = (page - 1) * limit;

      const [templatesResult, countResult] = await Promise.all([
        pool.query(
          'SELECT * FROM caption_templates ORDER BY created_at DESC LIMIT $1 OFFSET $2',
          [limit, offset]
        ),
        pool.query('SELECT COUNT(*) as count FROM caption_templates'),
      ]);

      return reply.send({
        templates: templatesResult.rows,
        total: parseInt(countResult.rows[0]?.count || '0'),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0]?.count || '0') / limit),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get templates');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch templates',
      });
    }
  });

	  app.post<{
	    Body: {
	      name: string;
	      category?: string;
	      is_public?: boolean;
	      is_premium?: boolean;
	      thumbnail_url?: string;
	      style_config: Record<string, any>;
	    };
	  }>('/admin/templates', {
	    preHandler: adminAuth,
	  }, async (request, reply) => {
	    try {
	      const schema = z.object({
	        name: z.string().min(1),
	        category: z.enum(['creator', 'professional', 'minimal', 'custom']).default('custom'),
	        is_public: z.boolean().default(true),
	        is_premium: z.boolean().default(false),
	        thumbnail_url: z.string().url().optional(),
	        style_config: z.record(z.any()),
	      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'INVALID_INPUT',
          message: 'Invalid request body',
          details: parsed.error.format(),
        });
      }

	      const { name, category, is_public, is_premium, thumbnail_url, style_config } = parsed.data;

	      const result = await pool.query(`
	        INSERT INTO caption_templates (
	          name, category, is_public, is_premium, thumbnail_url, created_by, style_config,
	          created_at, updated_at
	        )
	        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
	        RETURNING *
	      `, [
	        name,
	        category,
	        is_public,
	        is_premium,
	        thumbnail_url || null,
	        null, // system template by default
	        JSON.stringify(style_config),
	      ]);

      logger.info({ templateName: name, adminId: request.user?.userId }, 'Template created by admin');
      return reply.code(201).send({ template: result.rows[0] });
    } catch (error) {
      logger.error({ error }, 'Failed to create template');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to create template',
      });
    }
  });

	  app.patch<{
	    Params: { id: string };
	    Body: {
	      name?: string;
	      category?: string;
	      is_public?: boolean;
	      is_premium?: boolean;
	      thumbnail_url?: string;
	      style_config?: Record<string, any>;
	    };
	  }>('/admin/templates/:id', {
	    preHandler: adminAuth,
	  }, async (request, reply) => {
	    try {
	      const { id } = request.params;
	      const schema = z.object({
	        name: z.string().min(1).optional(),
	        category: z.enum(['creator', 'professional', 'minimal', 'custom']).optional(),
	        is_public: z.boolean().optional(),
	        is_premium: z.boolean().optional(),
	        thumbnail_url: z.string().url().optional(),
	        style_config: z.record(z.any()).optional(),
	      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'INVALID_INPUT',
          message: 'Invalid request body',
          details: parsed.error.format(),
        });
      }

	      const { name, category, is_public, is_premium, thumbnail_url, style_config } = parsed.data;
	      const fields: string[] = [];
	      const values: any[] = [];
	      let paramCount = 1;

	      if (name !== undefined) {
	        fields.push(`name = $${paramCount++}`);
	        values.push(name);
	      }
	      if (category !== undefined) {
	        fields.push(`category = $${paramCount++}`);
	        values.push(category);
	      }
	      if (is_public !== undefined) {
	        fields.push(`is_public = $${paramCount++}`);
	        values.push(is_public);
	      }
	      if (is_premium !== undefined) {
	        fields.push(`is_premium = $${paramCount++}`);
	        values.push(is_premium);
	      }
	      if (thumbnail_url !== undefined) {
	        fields.push(`thumbnail_url = $${paramCount++}`);
	        values.push(thumbnail_url);
	      }
	      if (style_config !== undefined) {
	        fields.push(`style_config = $${paramCount++}`);
	        values.push(JSON.stringify(style_config));
	      }

      if (fields.length === 0) {
        return reply.code(400).send({
          error: 'INVALID_INPUT',
          message: 'No fields to update',
        });
      }

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await pool.query(
        `UPDATE caption_templates SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (!result.rows[0]) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      logger.info({ templateId: id, adminId: request.user?.userId }, 'Template updated by admin');
      return reply.send({ template: result.rows[0] });
    } catch (error) {
      logger.error({ error }, 'Failed to update template');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to update template',
      });
    }
  });

  app.delete<{
    Params: { id: string }
  }>('/admin/templates/:id', {
    preHandler: adminAuth,
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await pool.query(
        'DELETE FROM caption_templates WHERE id = $1 RETURNING id',
        [id]
      );

      if (!result.rows[0]) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      logger.info({ templateId: id, adminId: request.user?.userId }, 'Template deleted by admin');
      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to delete template');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete template',
      });
    }
  });

  logger.info('Admin routes registered');
}
