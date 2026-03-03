import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { pool } from '../services/database.service.js';
import { getQueueHealth } from '../jobs/queue.js';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger('admin-routes');

/**
 * Middleware: require admin email after JWT auth
 */
async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticateJWT(request, reply);
  if (reply.sent) return;

  const email = request.user?.email?.toLowerCase();
  if (email !== env.billing.unlimitedAdminEmail) {
    return reply.code(403).send({ error: 'Forbidden', message: 'Admin access required' });
  }
}

export async function registerAdminRoutes(app: FastifyInstance) {
  // ============================================
  // STATS — Overview KPIs
  // ============================================
  app.get('/admin/stats', { preHandler: requireAdmin }, async (_request, reply) => {
    try {
      const [
        usersResult,
        newUsersResult,
        jobsResult,
        activeJobsResult,
        failedJobsResult,
        clipsResult,
        paidSubsResult,
        mrrResult,
        queueHealth,
      ] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS count FROM profiles'),
        pool.query("SELECT COUNT(*)::int AS count FROM profiles WHERE created_at > NOW() - INTERVAL '7 days'"),
        pool.query('SELECT COUNT(*)::int AS count FROM jobs'),
        pool.query("SELECT COUNT(*)::int AS count FROM jobs WHERE status = 'active'"),
        pool.query("SELECT COUNT(*)::int AS count FROM jobs WHERE status = 'failed'"),
        pool.query('SELECT COUNT(*)::int AS count FROM clips'),
        pool.query("SELECT COUNT(*)::int AS count FROM subscriptions WHERE status = 'active' AND plan_id != 'plan_free'"),
        pool.query("SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM payments WHERE status = 'approved' AND created_at > date_trunc('month', NOW())"),
        getQueueHealth(),
      ]);

      return reply.send({
        totalUsers: usersResult.rows[0]?.count ?? 0,
        newUsers7d: newUsersResult.rows[0]?.count ?? 0,
        totalJobs: jobsResult.rows[0]?.count ?? 0,
        activeJobs: activeJobsResult.rows[0]?.count ?? 0,
        failedJobs: failedJobsResult.rows[0]?.count ?? 0,
        totalClips: clipsResult.rows[0]?.count ?? 0,
        paidSubscribers: paidSubsResult.rows[0]?.count ?? 0,
        mrr: parseFloat(mrrResult.rows[0]?.total ?? '0'),
        queue: queueHealth,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error fetching admin stats');
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: error.message });
    }
  });

  // ============================================
  // USERS — All users with plan info
  // ============================================
  app.get('/admin/users', { preHandler: requireAdmin }, async (_request, reply) => {
    try {
      const result = await pool.query(`
        SELECT
          p.id, p.email, p.full_name, p.created_at, p.updated_at,
          s.plan_id, s.status AS sub_status
        FROM profiles p
        LEFT JOIN subscriptions s ON p.id::text = s.user_id AND s.status = 'active'
        ORDER BY p.created_at DESC
      `);

      return reply.send(result.rows);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error fetching admin users');
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: error.message });
    }
  });

  // ============================================
  // JOBS — All jobs across all users
  // ============================================
  app.get('/admin/jobs', { preHandler: requireAdmin }, async (request, reply) => {
    const query = request.query as { status?: string; limit?: string };
    const limit = Math.min(parseInt(query.limit || '50', 10), 200);

    try {
      let sql = `
        SELECT j.*, p.email AS user_email
        FROM jobs j
        LEFT JOIN profiles p ON j.user_id = p.id::text
      `;
      const params: any[] = [];

      if (query.status) {
        sql += ' WHERE j.status = $1';
        params.push(query.status);
      }

      sql += ' ORDER BY j.created_at DESC LIMIT $' + (params.length + 1);
      params.push(limit);

      const result = await pool.query(sql, params);
      return reply.send(result.rows);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error fetching admin jobs');
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: error.message });
    }
  });

  // ============================================
  // PAYMENTS — All payments
  // ============================================
  app.get('/admin/payments', { preHandler: requireAdmin }, async (request, reply) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(parseInt(query.limit || '50', 10), 200);

    try {
      const result = await pool.query(`
        SELECT pay.*, p.email AS user_email
        FROM payments pay
        LEFT JOIN profiles p ON pay.user_id = p.id::text
        ORDER BY pay.created_at DESC
        LIMIT $1
      `, [limit]);

      return reply.send(result.rows);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error fetching admin payments');
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: error.message });
    }
  });

  // ============================================
  // SYSTEM — Health checks
  // ============================================
  app.get('/admin/system', { preHandler: requireAdmin }, async (_request, reply) => {
    const checks: Record<string, any> = {};

    // Database
    try {
      const start = Date.now();
      await pool.query('SELECT 1');
      checks.database = { status: 'ok', latencyMs: Date.now() - start };
    } catch (error: any) {
      checks.database = { status: 'error', message: error.message };
    }

    // Redis
    try {
      const start = Date.now();
      await redis.ping();
      checks.redis = { status: 'ok', latencyMs: Date.now() - start };
    } catch (error: any) {
      checks.redis = { status: 'error', message: error.message };
    }

    // Queue
    try {
      checks.queue = await getQueueHealth();
    } catch (error: any) {
      checks.queue = { status: 'error', message: error.message };
    }

    // Process
    const mem = process.memoryUsage();
    checks.process = {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      nodeEnv: env.nodeEnv,
      nodeVersion: process.version,
    };

    return reply.send(checks);
  });
}
