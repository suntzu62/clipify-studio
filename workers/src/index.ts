import 'dotenv/config';
import makeWorker from './workers/worker';
import { ALL_QUEUES } from './lib/bullmq';
import start from './server';

// Start workers
ALL_QUEUES.forEach((q) => makeWorker(q));

// Start HTTP API
start();
