import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import {
  liveIngestWindows as dbLiveIngestWindows,
  liveSources as dbLiveSources,
  queueEvents as dbQueueEvents,
} from '../services/database.service.js';

const logger = createLogger('live-ingest-loop');

export interface LiveIngestLoopController {
  stop: () => void;
}

export function startLiveIngestLoop(): LiveIngestLoopController {
  if (!env.liveClippingEnabled) {
    logger.info('Live ingest loop disabled (LIVE_CLIPPING_ENABLED=false)');
    return { stop: () => {} };
  }

  const intervalMs = Math.max(
    30_000,
    Number.isFinite(Number(process.env.LIVE_INGEST_INTERVAL_MS))
      ? Number(process.env.LIVE_INGEST_INTERVAL_MS)
      : 120_000
  );

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      const activeSources = await dbLiveSources.findActive(100);
      const now = new Date();

      for (const source of activeSources) {
        const lastIngestedAt = source.last_ingested_at ? new Date(source.last_ingested_at) : null;
        const fallbackStart = new Date(now.getTime() - intervalMs);

        const windowStart = lastIngestedAt && !Number.isNaN(lastIngestedAt.getTime()) && lastIngestedAt < now
          ? lastIngestedAt
          : fallbackStart;

        const windowEnd = now;

        const window = await dbLiveIngestWindows.insert({
          source_id: source.id,
          user_id: source.user_id,
          window_start: windowStart,
          window_end: windowEnd,
          status: 'processed',
        });

        await dbLiveSources.update(source.id, source.user_id, {
          last_ingested_at: now,
        });

        await dbQueueEvents.insert({
          user_id: source.user_id,
          queue_name: 'live-ingest',
          entity_type: 'live_source',
          entity_id: source.id,
          event_type: 'window_processed',
          status: 'completed',
          payload: {
            ingestWindowId: window.id,
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
          },
        });
      }

      if (activeSources.length > 0) {
        logger.info({ activeSources: activeSources.length }, 'Live ingest windows generated');
      }
    } catch (error: any) {
      logger.error({ error: error?.message }, 'Live ingest loop tick failed');
    } finally {
      running = false;
    }
  };

  // Prime first tick soon after boot.
  const firstTimeout = setTimeout(() => {
    tick();
  }, 2_000);

  const timer = setInterval(() => {
    tick();
  }, intervalMs);

  logger.info({ intervalMs }, 'Live ingest loop started');

  return {
    stop: () => {
      clearTimeout(firstTimeout);
      clearInterval(timer);
      logger.info('Live ingest loop stopped');
    },
  };
}
