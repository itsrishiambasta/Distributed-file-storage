import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import routes from './routes/index.js';
import { replicationWatcher } from './services/replicationWatcher.js';

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use(rateLimit({
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.max,
  message:  { error: 'Too many requests, please slow down.' },
}));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', routes);

// 404 handler
app.use((_, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use((err, req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`\n🗄️  Distributed File Storage running on http://localhost:${config.port}`);
  console.log(`   Nodes: ${config.nodes.map(n => n.id).join(', ')}`);
  console.log(`   Chunk size: ${config.storage.chunkSizeBytes / 1024 / 1024} MB`);
  console.log(`   Replication factor: ${config.storage.replicationFactor}\n`);

  // Start background replication watcher
  replicationWatcher.start(30_000);
});

export default app;
