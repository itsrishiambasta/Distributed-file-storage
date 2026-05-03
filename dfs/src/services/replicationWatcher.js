import db from '../models/db.js';
import { nodeRegistry } from './nodeRegistry.js';
import { chunkEngine } from './chunkEngine.js';
import { config } from '../config/index.js';

/**
 * ReplicationWatcher runs periodically and:
 *  1. Checks each chunk to ensure it meets the replication factor.
 *  2. Re-replicates chunks that are under-replicated due to node failures.
 */
class ReplicationWatcher {
  constructor() {
    this.interval = null;
    this.running  = false;
  }

  start(intervalMs = 30_000) {
    console.log(`[Watcher] Starting replication watcher (every ${intervalMs / 1000}s)`);
    this.interval = setInterval(() => this.check(), intervalMs);
    this.check(); // run immediately on start
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[Watcher] Stopped');
    }
  }

  async check() {
    if (this.running) return;
    this.running = true;

    try {
      const desired    = config.storage.replicationFactor;
      const healthyIds = new Set(nodeRegistry.getHealthyNodes().map(n => n.id));

      // Find chunks with fewer healthy replicas than desired
      const underReplicated = db.prepare(`
        SELECT c.id AS chunk_id, c.file_id, c.chunk_index,
               GROUP_CONCAT(cl.node_id) AS node_ids
        FROM chunks c
        JOIN chunk_locations cl ON cl.chunk_id = c.id
        GROUP BY c.id
        HAVING COUNT(cl.node_id) < ?
      `).all(desired);

      if (underReplicated.length === 0) return;

      console.log(`[Watcher] ${underReplicated.length} chunk(s) need re-replication`);

      const insertLocation = db.prepare(`
        INSERT OR IGNORE INTO chunk_locations (chunk_id, node_id) VALUES (?, ?)
      `);

      for (const row of underReplicated) {
        const existingNodes = new Set(row.node_ids.split(','));
        const sourceNodeId  = [...existingNodes].find(id => healthyIds.has(id));

        if (!sourceNodeId) {
          console.warn(`[Watcher] No healthy source for chunk ${row.chunk_id} — skipping`);
          continue;
        }

        const sourceNode = nodeRegistry.getNode(sourceNodeId);
        const chunkData  = chunkEngine.readChunkFromDisk(sourceNode.path, row.chunk_id);
        if (!chunkData) continue;

        // Find nodes that don't yet have this chunk
        const candidates = nodeRegistry.getHealthyNodes()
          .filter(n => !existingNodes.has(n.id));

        const needed = desired - existingNodes.size;
        const targets = candidates.slice(0, needed);

        for (const target of targets) {
          chunkEngine.writeChunkToDisk(target.path, row.chunk_id, chunkData);
          insertLocation.run(row.chunk_id, target.id);
          nodeRegistry.updateUsage(target.id, chunkData.length);
          console.log(`[Watcher] Re-replicated chunk ${row.chunk_id} → ${target.id}`);
        }
      }
    } catch (err) {
      console.error('[Watcher] Error during check:', err.message);
    } finally {
      this.running = false;
    }
  }
}

export const replicationWatcher = new ReplicationWatcher();
