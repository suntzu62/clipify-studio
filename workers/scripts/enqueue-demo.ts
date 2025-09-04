import 'dotenv/config';
import { FlowProducer } from 'bullmq';
import { connection } from '../src/redis';
import { QUEUES } from '../src/queues';

const flow = new FlowProducer({ connection });

const main = async () => {
  const tree = await flow.add({
    name: 'pipeline',
    queueName: QUEUES.INGEST,
    data: { url: 'https://youtube.com/watch?v=DEMO' },
    children: [
      {
        name: 'transcribe',
        queueName: QUEUES.TRANSCRIBE,
        data: {},
        children: [
          {
            name: 'scenes',
            queueName: QUEUES.SCENES,
            data: {},
            children: [
              {
                name: 'rank',
                queueName: QUEUES.RANK,
                data: {},
                children: [
                  {
                    name: 'render',
                    queueName: QUEUES.RENDER,
                    data: {},
                    children: [
                      {
                        name: 'texts',
                        queueName: QUEUES.TEXTS,
                        data: {},
                        children: [
                          {
                            name: 'export',
                            queueName: QUEUES.EXPORT,
                            data: {},
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
