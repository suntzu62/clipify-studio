import 'dotenv/config';
import { FlowProducer } from 'bullmq';
import { randomUUID as crypto } from 'crypto';
import { connection } from '../src/redis';
import { QUEUES } from '../src/queues';

const flow = new FlowProducer({ connection });

const main = async () => {
  const rootId = crypto.randomUUID();
  
  const tree = await flow.add({
    name: 'pipeline',
    queueName: QUEUES.INGEST,
    opts: { jobId: rootId },
    data: { url: 'https://youtube.com/watch?v=DEMO', rootId },
    children: [
      {
        name: 'transcribe',
        queueName: QUEUES.TRANSCRIBE,
        data: { rootId },
        children: [
          {
            name: 'scenes',
            queueName: QUEUES.SCENES,
            data: { rootId },
            children: [
              {
                name: 'rank',
                queueName: QUEUES.RANK,
                data: { rootId },
                children: [
                  {
                    name: 'render',
                    queueName: QUEUES.RENDER,
                    data: { rootId },
                    children: [
                      {
                        name: 'texts',
                        queueName: QUEUES.TEXTS,
                        data: { rootId },
                        children: [
                          {
                            name: 'export',
                            queueName: QUEUES.EXPORT,
                            data: { rootId },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  console.log('ENQUEUED', tree.job.id);
};

main().then(() => process.exit(0));
