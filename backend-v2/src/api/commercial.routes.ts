import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import {
  brandKits as dbBrandKits,
  clips as dbClips,
  liveIngestWindows as dbLiveIngestWindows,
  liveSources as dbLiveSources,
  queueEvents as dbQueueEvents,
  scheduledPublications as dbScheduledPublications,
  pool,
} from '../services/database.service.js';
import { enqueuePublication, removePublicationFromQueue, getPublishQueueHealth } from '../jobs/publish-queue.js';

const logger = createLogger('commercial-routes');

const PublicationPlatformSchema = z.enum(['instagram', 'youtube', 'tiktok']);

const CreatePublicationSchema = z.object({
  clipId: z.string().min(1),
  platform: PublicationPlatformSchema,
  scheduledAt: z.string().datetime(),
  timezone: z.string().min(1).default('UTC'),
  metadata: z.record(z.any()).optional(),
  idempotencyKey: z.string().min(1).max(120).optional(),
});

const UpdatePublicationSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  timezone: z.string().min(1).optional(),
  status: z.enum(['scheduled', 'cancelled']).optional(),
  metadata: z.record(z.any()).optional(),
});

const BrandKitSchema = z.object({
  name: z.string().min(2).max(120),
  logoUrl: z.string().url().optional().nullable(),
  introUrl: z.string().url().optional().nullable(),
  outroUrl: z.string().url().optional().nullable(),
  palette: z.record(z.any()).optional(),
  watermark: z.record(z.any()).optional(),
  captionStyleId: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
});

const UpdateBrandKitSchema = BrandKitSchema.partial();

const ApplyBrandKitSchema = z.object({
  clipIds: z.array(z.string().min(1)).min(1).max(100),
  mode: z.enum(['watermark_only', 'full_package']).default('full_package'),
});

const CreateLiveSourceSchema = z.object({
  platform: z.enum(['youtube_live', 'twitch']).default('youtube_live'),
  streamUrl: z.string().url(),
});

function mapPublication(row: any) {
  return {
    id: row.id,
    clipId: row.clip_id,
    platform: row.platform,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone,
    status: row.status,
    retryCount: row.retry_count,
    lastError: row.last_error,
    publicationUrl: row.publication_url,
    publishedAt: row.published_at,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBrandKit(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    logoUrl: row.logo_url,
    introUrl: row.intro_url,
    outroUrl: row.outro_url,
    palette: row.palette || {},
    watermark: row.watermark || {},
    captionStyleId: row.caption_style_id,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLiveSource(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    streamUrl: row.stream_url,
    status: row.status,
    startedAt: row.started_at,
    lastIngestedAt: row.last_ingested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureClipOwnership(clipId: string, userId: string) {
  const clip = await dbClips.findById(clipId);
  if (!clip || clip.user_id !== userId) {
    return null;
  }
  return clip;
}

export async function registerCommercialRoutes(app: FastifyInstance) {
  // ============================================
  // Scheduled publications + queue
  // ============================================

  app.post('/social/publications', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.schedulerEnabled) {
      return reply.status(403).send({
        error: 'SCHEDULER_DISABLED',
        message: 'Scheduler está desabilitado neste ambiente.',
      });
    }

    const parsed = CreatePublicationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid publication payload',
        details: parsed.error.format(),
      });
    }

    const userId = request.user!.userId;
    const payload = parsed.data;

    const clip = await ensureClipOwnership(payload.clipId, userId);
    if (!clip) {
      return reply.status(404).send({
        error: 'CLIP_NOT_FOUND',
        message: 'Clip não encontrado',
      });
    }

    const scheduledAtDate = new Date(payload.scheduledAt);
    if (Number.isNaN(scheduledAtDate.getTime())) {
      return reply.status(400).send({
        error: 'INVALID_DATE',
        message: 'scheduledAt inválido',
      });
    }

    const publication = await dbScheduledPublications.insert({
      user_id: userId,
      clip_id: payload.clipId,
      platform: payload.platform,
      scheduled_at: scheduledAtDate,
      timezone: payload.timezone,
      metadata: payload.metadata,
      idempotency_key: payload.idempotencyKey,
    });

    await enqueuePublication(
      {
        publicationId: publication.id,
        userId,
        clipId: payload.clipId,
        platform: payload.platform,
        idempotencyKey: payload.idempotencyKey,
      },
      scheduledAtDate
    );

    await dbQueueEvents.insert({
      user_id: userId,
      queue_name: 'publish-queue',
      entity_type: 'scheduled_publication',
      entity_id: publication.id,
      event_type: 'queued',
      status: 'queued',
      payload: {
        platform: payload.platform,
        clipId: payload.clipId,
        scheduledAt: scheduledAtDate.toISOString(),
      },
    });

    return reply.status(201).send({
      publication: mapPublication(publication),
    });
  });

  app.get('/social/publications', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.schedulerEnabled) {
      return reply.status(403).send({
        error: 'SCHEDULER_DISABLED',
        message: 'Scheduler está desabilitado neste ambiente.',
      });
    }

    const userId = request.user!.userId;
    const query = z.object({
      limit: z.coerce.number().min(1).max(200).default(100),
      offset: z.coerce.number().min(0).default(0),
    }).safeParse(request.query);

    const limit = query.success ? query.data.limit : 100;
    const offset = query.success ? query.data.offset : 0;

    const rows = await dbScheduledPublications.findByUserId(userId, limit, offset);
    return {
      publications: rows.map(mapPublication),
    };
  });

  app.patch('/social/publications/:id', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.schedulerEnabled) {
      return reply.status(403).send({
        error: 'SCHEDULER_DISABLED',
        message: 'Scheduler está desabilitado neste ambiente.',
      });
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    const body = UpdatePublicationSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid update payload',
      });
    }

    const userId = request.user!.userId;
    const publication = await dbScheduledPublications.findByIdForUser(params.data.id, userId);
    if (!publication) {
      return reply.status(404).send({
        error: 'PUBLICATION_NOT_FOUND',
        message: 'Publicação não encontrada',
      });
    }

    const scheduledAt = body.data.scheduledAt ? new Date(body.data.scheduledAt) : undefined;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      return reply.status(400).send({
        error: 'INVALID_DATE',
        message: 'scheduledAt inválido',
      });
    }

    const nextStatus = body.data.status;

    if (nextStatus === 'cancelled') {
      await removePublicationFromQueue(publication.id);
    }

    const updated = await dbScheduledPublications.update(publication.id, {
      scheduled_at: scheduledAt,
      timezone: body.data.timezone,
      status: nextStatus,
      metadata: body.data.metadata,
      last_error: nextStatus === 'cancelled' ? null : undefined,
    });

    if (!updated) {
      return reply.status(404).send({
        error: 'PUBLICATION_NOT_FOUND',
        message: 'Publicação não encontrada',
      });
    }

    if (scheduledAt && updated.status === 'scheduled') {
      await removePublicationFromQueue(updated.id);
      await enqueuePublication(
        {
          publicationId: updated.id,
          userId,
          clipId: updated.clip_id,
          platform: updated.platform,
          idempotencyKey: updated.idempotency_key || undefined,
        },
        scheduledAt
      );

      await dbQueueEvents.insert({
        user_id: userId,
        queue_name: 'publish-queue',
        entity_type: 'scheduled_publication',
        entity_id: updated.id,
        event_type: 'rescheduled',
        status: 'queued',
        payload: {
          scheduledAt: scheduledAt.toISOString(),
          platform: updated.platform,
        },
      });
    }

    if (nextStatus === 'cancelled') {
      await dbQueueEvents.insert({
        user_id: userId,
        queue_name: 'publish-queue',
        entity_type: 'scheduled_publication',
        entity_id: updated.id,
        event_type: 'cancelled',
        status: 'cancelled',
        payload: {},
      });
    }

    return {
      publication: mapPublication(updated),
    };
  });

  app.delete('/social/publications/:id', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.schedulerEnabled) {
      return reply.status(403).send({
        error: 'SCHEDULER_DISABLED',
        message: 'Scheduler está desabilitado neste ambiente.',
      });
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid publication id',
      });
    }

    const userId = request.user!.userId;
    const publication = await dbScheduledPublications.findByIdForUser(params.data.id, userId);
    if (!publication) {
      return reply.status(404).send({
        error: 'PUBLICATION_NOT_FOUND',
        message: 'Publicação não encontrada',
      });
    }

    await removePublicationFromQueue(publication.id);
    const updated = await dbScheduledPublications.update(publication.id, {
      status: 'cancelled',
      last_error: null,
    });

    await dbQueueEvents.insert({
      user_id: userId,
      queue_name: 'publish-queue',
      entity_type: 'scheduled_publication',
      entity_id: publication.id,
      event_type: 'cancelled',
      status: 'cancelled',
      payload: {},
    });

    return {
      success: true,
      publication: updated ? mapPublication(updated) : mapPublication(publication),
    };
  });

  app.get('/queue/my', { preHandler: authenticateJWT }, async (request, reply) => {
    const userId = request.user!.userId;

    const [publications, queueEvents, publishHealth] = await Promise.all([
      dbScheduledPublications.findByUserId(userId, 200, 0),
      dbQueueEvents.listByUserId(userId, 200),
      getPublishQueueHealth().catch(() => null),
    ]);

    const scheduledSorted = publications
      .filter((row) => row.status === 'scheduled')
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    const queueItems = publications.map((row) => {
      const scheduledIndex = scheduledSorted.findIndex((s) => s.id === row.id);
      const scheduledAt = new Date(row.scheduled_at);
      const etaSeconds = Math.max(0, Math.round((scheduledAt.getTime() - Date.now()) / 1000));

      return {
        id: row.id,
        type: 'publication',
        priority: 1,
        position: scheduledIndex >= 0 ? scheduledIndex + 1 : 0,
        etaSeconds,
        status: row.status,
        scheduledAt: row.scheduled_at,
        payload: {
          clipId: row.clip_id,
          platform: row.platform,
          timezone: row.timezone,
        },
      };
    });

    const extraEvents = queueEvents
      .filter((event) => event.entity_type !== 'scheduled_publication')
      .map((event) => ({
        id: event.id,
        type: event.entity_type,
        priority: 5,
        position: 0,
        etaSeconds: 0,
        status: event.status,
        scheduledAt: null,
        payload: {
          entityId: event.entity_id,
          queueName: event.queue_name,
          eventType: event.event_type,
          ...((event.payload || {}) as Record<string, unknown>),
        },
      }));

    return {
      items: [...queueItems, ...extraEvents],
      stats: {
        scheduledCount: scheduledSorted.length,
        failedCount: publications.filter((row) => row.status === 'failed').length,
        publishedCount: publications.filter((row) => row.status === 'published').length,
        queue: publishHealth,
      },
    };
  });

  // ============================================
  // Brand kit
  // ============================================

  app.post('/brand-kits', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.brandKitEnabled) {
      return reply.status(403).send({
        error: 'BRAND_KIT_DISABLED',
        message: 'Brand kit está desabilitado neste ambiente.',
      });
    }

    const parsed = BrandKitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid brand kit payload',
        details: parsed.error.format(),
      });
    }

    const userId = request.user!.userId;
    const payload = parsed.data;

    const created = await dbBrandKits.insert({
      user_id: userId,
      name: payload.name,
      logo_url: payload.logoUrl,
      intro_url: payload.introUrl,
      outro_url: payload.outroUrl,
      palette: payload.palette,
      watermark: payload.watermark,
      caption_style_id: payload.captionStyleId,
      is_default: payload.isDefault,
    });

    if (payload.isDefault) {
      await dbBrandKits.setDefault(created.id, userId);
    }

    return reply.status(201).send({
      brandKit: mapBrandKit(created),
    });
  });

  app.get('/brand-kits', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.brandKitEnabled) {
      return reply.status(403).send({
        error: 'BRAND_KIT_DISABLED',
        message: 'Brand kit está desabilitado neste ambiente.',
      });
    }

    const userId = request.user!.userId;
    const rows = await dbBrandKits.findByUserId(userId);

    return {
      brandKits: rows.map(mapBrandKit),
    };
  });

  app.patch('/brand-kits/:id', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.brandKitEnabled) {
      return reply.status(403).send({
        error: 'BRAND_KIT_DISABLED',
        message: 'Brand kit está desabilitado neste ambiente.',
      });
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    const body = UpdateBrandKitSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid brand kit payload',
      });
    }

    const userId = request.user!.userId;

    const updated = await dbBrandKits.update(params.data.id, userId, {
      name: body.data.name,
      logo_url: body.data.logoUrl,
      intro_url: body.data.introUrl,
      outro_url: body.data.outroUrl,
      palette: body.data.palette,
      watermark: body.data.watermark,
      caption_style_id: body.data.captionStyleId,
      is_default: body.data.isDefault,
    });

    if (!updated) {
      return reply.status(404).send({
        error: 'BRAND_KIT_NOT_FOUND',
        message: 'Brand kit não encontrado',
      });
    }

    if (body.data.isDefault) {
      await dbBrandKits.setDefault(updated.id, userId);
    }

    return {
      brandKit: mapBrandKit(updated),
    };
  });

  app.delete('/brand-kits/:id', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.brandKitEnabled) {
      return reply.status(403).send({
        error: 'BRAND_KIT_DISABLED',
        message: 'Brand kit está desabilitado neste ambiente.',
      });
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid brand kit id',
      });
    }

    const userId = request.user!.userId;
    const removed = await dbBrandKits.remove(params.data.id, userId);

    if (!removed) {
      return reply.status(404).send({
        error: 'BRAND_KIT_NOT_FOUND',
        message: 'Brand kit não encontrado',
      });
    }

    return {
      success: true,
      brandKit: mapBrandKit(removed),
    };
  });

  app.post('/brand-kits/:id/apply', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.brandKitEnabled) {
      return reply.status(403).send({
        error: 'BRAND_KIT_DISABLED',
        message: 'Brand kit está desabilitado neste ambiente.',
      });
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    const body = ApplyBrandKitSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid apply payload',
      });
    }

    const userId = request.user!.userId;
    const brandKit = await dbBrandKits.findByIdForUser(params.data.id, userId);

    if (!brandKit) {
      return reply.status(404).send({
        error: 'BRAND_KIT_NOT_FOUND',
        message: 'Brand kit não encontrado',
      });
    }

    const validClipIds: string[] = [];

    for (const clipId of body.data.clipIds) {
      const clip = await ensureClipOwnership(clipId, userId);
      if (clip) {
        validClipIds.push(clipId);
      }
    }

    if (!validClipIds.length) {
      return reply.status(400).send({
        error: 'NO_VALID_CLIPS',
        message: 'Nenhum clip válido para aplicar brand kit',
      });
    }

    for (const clipId of validClipIds) {
      await dbQueueEvents.insert({
        user_id: userId,
        queue_name: 'brand-kit-queue',
        entity_type: 'brand_kit_apply',
        entity_id: clipId,
        event_type: 'queued',
        status: 'queued',
        payload: {
          brandKitId: brandKit.id,
          mode: body.data.mode,
        },
      });

      await dbQueueEvents.insert({
        user_id: userId,
        queue_name: 'brand-kit-queue',
        entity_type: 'brand_kit_apply',
        entity_id: clipId,
        event_type: 'completed',
        status: 'completed',
        payload: {
          brandKitId: brandKit.id,
          mode: body.data.mode,
        },
      });
    }

    return {
      success: true,
      appliedCount: validClipIds.length,
      clipIds: validClipIds,
      mode: body.data.mode,
      brandKitId: brandKit.id,
    };
  });

  // ============================================
  // Live sources
  // ============================================

  app.post('/lives/sources', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.liveClippingEnabled) {
      return reply.status(403).send({
        error: 'LIVE_CLIPPING_DISABLED',
        message: 'Live clipping está desabilitado neste ambiente.',
      });
    }

    const parsed = CreateLiveSourceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid live source payload',
        details: parsed.error.format(),
      });
    }

    const userId = request.user!.userId;

    const created = await dbLiveSources.insert({
      user_id: userId,
      platform: parsed.data.platform,
      stream_url: parsed.data.streamUrl,
      status: 'idle',
    });

    return reply.status(201).send({
      liveSource: mapLiveSource(created),
    });
  });

  app.get('/lives/sources', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.liveClippingEnabled) {
      return reply.status(403).send({
        error: 'LIVE_CLIPPING_DISABLED',
        message: 'Live clipping está desabilitado neste ambiente.',
      });
    }

    const userId = request.user!.userId;
    const rows = await dbLiveSources.findByUserId(userId);

    return {
      sources: rows.map(mapLiveSource),
    };
  });

  app.post('/lives/sources/:id/start', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.liveClippingEnabled) {
      return reply.status(403).send({
        error: 'LIVE_CLIPPING_DISABLED',
        message: 'Live clipping está desabilitado neste ambiente.',
      });
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid source id',
      });
    }

    const userId = request.user!.userId;
    const source = await dbLiveSources.findByIdForUser(params.data.id, userId);

    if (!source) {
      return reply.status(404).send({
        error: 'LIVE_SOURCE_NOT_FOUND',
        message: 'Fonte de live não encontrada',
      });
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - 2 * 60 * 1000);

    const updated = await dbLiveSources.update(source.id, userId, {
      status: 'active',
      started_at: source.started_at || now,
      stopped_at: null,
      last_ingested_at: now,
    });

    const ingestWindow = await dbLiveIngestWindows.insert({
      source_id: source.id,
      user_id: userId,
      window_start: windowStart,
      window_end: now,
      status: 'pending',
    });

    await dbQueueEvents.insert({
      user_id: userId,
      queue_name: 'live-ingest',
      entity_type: 'live_source',
      entity_id: source.id,
      event_type: 'started',
      status: 'queued',
      payload: {
        ingestWindowId: ingestWindow.id,
        windowStart: windowStart.toISOString(),
        windowEnd: now.toISOString(),
      },
    });

    return {
      liveSource: updated ? mapLiveSource(updated) : mapLiveSource(source),
      ingestWindow,
    };
  });

  app.post('/lives/sources/:id/stop', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.liveClippingEnabled) {
      return reply.status(403).send({
        error: 'LIVE_CLIPPING_DISABLED',
        message: 'Live clipping está desabilitado neste ambiente.',
      });
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid source id',
      });
    }

    const userId = request.user!.userId;
    const source = await dbLiveSources.findByIdForUser(params.data.id, userId);

    if (!source) {
      return reply.status(404).send({
        error: 'LIVE_SOURCE_NOT_FOUND',
        message: 'Fonte de live não encontrada',
      });
    }

    const updated = await dbLiveSources.update(source.id, userId, {
      status: 'stopped',
      stopped_at: new Date(),
    });

    await dbQueueEvents.insert({
      user_id: userId,
      queue_name: 'live-ingest',
      entity_type: 'live_source',
      entity_id: source.id,
      event_type: 'stopped',
      status: 'cancelled',
      payload: {},
    });

    return {
      liveSource: updated ? mapLiveSource(updated) : mapLiveSource(source),
    };
  });

  app.get('/lives/sources/:id/clips', { preHandler: authenticateJWT }, async (request, reply) => {
    if (!env.liveClippingEnabled) {
      return reply.status(403).send({
        error: 'LIVE_CLIPPING_DISABLED',
        message: 'Live clipping está desabilitado neste ambiente.',
      });
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    const query = z.object({ limit: z.coerce.number().min(1).max(100).default(30) }).safeParse(request.query);

    if (!params.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid source id',
      });
    }

    const userId = request.user!.userId;
    const source = await dbLiveSources.findByIdForUser(params.data.id, userId);
    if (!source) {
      return reply.status(404).send({
        error: 'LIVE_SOURCE_NOT_FOUND',
        message: 'Fonte de live não encontrada',
      });
    }

    const limit = query.success ? query.data.limit : 30;

    const rows = await pool.query(
      `SELECT
         c.id,
         c.job_id,
         c.title,
         c.video_url,
         c.thumbnail_url,
         c.ai_score,
         c.created_at
       FROM clips c
       JOIN jobs j ON j.id = c.job_id
       WHERE j.user_id = $1
         AND j.metadata ->> 'live_source_id' = $2
       ORDER BY c.created_at DESC
       LIMIT $3`,
      [userId, source.id, limit]
    );

    if (rows.rows.length === 0) {
      const windows = await dbLiveIngestWindows.findBySourceId(source.id, userId, limit);
      return {
        clips: windows.map((window: any) => ({
          id: window.id,
          sourceId: source.id,
          jobId: window.job_id || window.id,
          title: `Live window ${new Date(window.window_start).toLocaleTimeString('pt-BR')}`,
          clipUrl: source.stream_url,
          thumbnailUrl: null,
          createdAt: window.created_at,
          viralScore: null,
        })),
      };
    }

    return {
      clips: rows.rows.map((row: any) => ({
        id: row.id,
        sourceId: source.id,
        jobId: row.job_id,
        title: row.title || `Live clip ${row.id}`,
        clipUrl: row.video_url,
        thumbnailUrl: row.thumbnail_url,
        createdAt: row.created_at,
        viralScore: row.ai_score,
      })),
    };
  });

  logger.info({
    schedulerEnabled: env.schedulerEnabled,
    brandKitEnabled: env.brandKitEnabled,
    liveClippingEnabled: env.liveClippingEnabled,
  }, 'Commercial routes registered');
}
