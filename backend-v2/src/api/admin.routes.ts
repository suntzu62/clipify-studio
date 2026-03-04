import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { pool } from '../services/database.service.js';
import { getQueueHealth } from '../jobs/queue.js';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger('admin-routes');

/**
 * Safe query — returns 0 / empty rows if table doesn't exist
 */
async function safeCount(sql: string): Promise<number> {
  try {
    const { rows } = await pool.query(sql);
    return parseInt(rows[0]?.count ?? '0', 10);
  } catch {
    return 0;
  }
}

async function safeQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (error: any) {
    logger.warn({ error: error.message, sql: sql.slice(0, 80) }, 'Admin query failed (table may not exist)');
    return [];
  }
}

/**
 * Middleware: require admin email after JWT auth.
 * The onRequest hook may have already decoded the JWT from the cookie and set
 * request.user. If so, skip authenticateJWT to avoid a duplicate 401 when only
 * the X-API-Key header passed the global gate.
 */
async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    await authenticateJWT(request, reply);
    if (reply.sent) return;
  }

  const email = request.user?.email?.toLowerCase();
  if (!email) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required for admin' });
  }
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
        totalUsers,
        newUsers7d,
        totalJobs,
        activeJobs,
        failedJobs,
        totalClips,
        paidSubscribers,
        mrrRows,
        queueHealth,
      ] = await Promise.all([
        safeCount('SELECT COUNT(*)::int AS count FROM profiles'),
        safeCount("SELECT COUNT(*)::int AS count FROM profiles WHERE created_at > NOW() - INTERVAL '7 days'"),
        safeCount('SELECT COUNT(*)::int AS count FROM jobs'),
        safeCount("SELECT COUNT(*)::int AS count FROM jobs WHERE status = 'active'"),
        safeCount("SELECT COUNT(*)::int AS count FROM jobs WHERE status = 'failed'"),
        safeCount('SELECT COUNT(*)::int AS count FROM clips'),
        safeCount("SELECT COUNT(*)::int AS count FROM subscriptions WHERE status = 'active' AND plan_id != 'plan_free'"),
        safeQuery("SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM payments WHERE status = 'approved' AND created_at > date_trunc('month', NOW())"),
        getQueueHealth(),
      ]);

      return reply.send({
        totalUsers,
        newUsers7d,
        totalJobs,
        activeJobs,
        failedJobs,
        totalClips,
        paidSubscribers,
        mrr: parseFloat((mrrRows[0] as any)?.total ?? '0'),
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
      // Try with subscription join first, fall back to profiles-only
      let rows = await safeQuery(`
        SELECT
          p.id, p.email, p.full_name, p.created_at, p.updated_at,
          s.plan_id, s.status AS sub_status
        FROM profiles p
        LEFT JOIN subscriptions s ON p.id::text = s.user_id AND s.status = 'active'
        ORDER BY p.created_at DESC
      `);

      if (rows.length === 0) {
        // Fallback: just profiles without join
        rows = await safeQuery(`
          SELECT id, email, full_name, created_at, updated_at, NULL AS plan_id, NULL AS sub_status
          FROM profiles ORDER BY created_at DESC
        `);
      }

      return reply.send(rows);
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

      const rows = await safeQuery(sql, params);
      return reply.send(rows);
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
      const rows = await safeQuery(`
        SELECT pay.*, p.email AS user_email
        FROM payments pay
        LEFT JOIN profiles p ON pay.user_id = p.id::text
        ORDER BY pay.created_at DESC
        LIMIT $1
      `, [limit]);

      return reply.send(rows);
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
