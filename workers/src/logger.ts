import pino from 'pino';

// Central logger for workers modules
// Level can be controlled via LOG_LEVEL, default 'info'
// Name helps identify source in aggregated logs
export const logger = pino({
  name: process.env.LOGGER_NAME || 'workers',
  level: process.env.LOG_LEVEL || 'info',
});

export default logger;

