import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',

  storage: {
    chunkSizeBytes: (parseInt(process.env.CHUNK_SIZE_MB) || 2) * 1024 * 1024,
    basePath: process.env.STORAGE_BASE_PATH || './storage',
    replicationFactor: parseInt(process.env.REPLICATION_FACTOR) || 3,
  },

  nodes: (process.env.NODE_IDS || 'node-a,node-b,node-c').split(',').map(id => ({
    id: id.trim(),
    path: `${process.env.STORAGE_BASE_PATH || './storage'}/${id.trim()}`,
    healthy: true,
    usedBytes: 0,
  })),

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  },
};
