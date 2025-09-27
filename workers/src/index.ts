import 'dotenv/config';
import makeWorker from './workers/worker';
import { ALL_QUEUES } from './lib/bullmq';
import start from './server';
import { backgroundProcessor } from './lib/background-processor';

async function main() {
  ALL_QUEUES.forEach((q) => makeWorker(q));
  
  // Start background processor for popular videos
  backgroundProcessor.start();
  
  await start();
}

main().catch((error) => {
  console.error('Failed to start workers service', error);
  process.exit(1);
});
