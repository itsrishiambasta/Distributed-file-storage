import db from '../models/db.js';
import { nodeRegistry } from '../services/nodeRegistry.js';
import { replicationWatcher } from '../services/replicationWatcher.js';

/** GET /admin/nodes - list all nodes and their status */
export function listNodes(req, res) {
  res.json({ nodes: nodeRegistry.summary() });
}

/** POST /admin/nodes/:id/health - toggle node health for testing */
export function setNodeHealth(req, res) {
  const { id } = req.params;
  const { healthy } = req.body;

  if (typeof healthy !== 'boolean') {
    return res.status(400).json({ error: '"healthy" (boolean) required' });
  }

  nodeRegistry.setHealth(id, healthy);
  res.json({ nodeId: id, healthy });
}

/** POST /admin/replicate - trigger an immediate replication check */
export async function triggerReplication(req, res) {
  await replicationWatcher.check();
  res.json({ message: 'Replication check complete' });
}

/** GET /admin/stats - system-wide statistics */
export function systemStats(req, res) {
  const totalFiles = db.prepare(`SELECT COUNT(*) AS c FROM files WHERE deleted_at IS NULL`).get().c;
  const totalSize  = db.prepare(`SELECT COALESCE(SUM(size_bytes),0) AS s FROM files WHERE deleted_at IS NULL`).get().s;
  const totalChunks = db.prepare(`SELECT COUNT(*) AS c FROM chunks`).get().c;
  const totalUsers = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
  const locations  = db.prepare(`SELECT COUNT(*) AS c FROM chunk_locations`).get().c;

  const dedupSavings = locations > 0
    ? Math.max(0, locations - totalChunks)
    : 0;

  res.json({
    files:          totalFiles,
    totalSizeBytes: totalSize,
    totalSizeMB:    +(totalSize / 1024 / 1024).toFixed(2),
    chunks:         totalChunks,
    chunkReplicas:  locations,
    dedupSaved:     dedupSavings,
    users:          totalUsers,
    nodes:          nodeRegistry.summary(),
  });
}
