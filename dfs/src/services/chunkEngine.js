import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readFile } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import db from '../models/db.js';
import { nodeRegistry } from './nodeRegistry.js';

/**
 * ChunkEngine handles splitting files into chunks, hashing for deduplication,
 * storing chunks across nodes, and reassembling files on download.
 */
export class ChunkEngine {

  /**
   * Split a buffer into fixed-size chunks and compute SHA-256 for each.
   * @param {Buffer} buffer - full file buffer
   * @returns {{ index: number, data: Buffer, checksum: string }[]}
   */
  splitIntoChunks(buffer) {
    const size = config.storage.chunkSizeBytes;
    const chunks = [];
    let index = 0;

    for (let offset = 0; offset < buffer.length; offset += size) {
      const data = buffer.subarray(offset, offset + size);
      const checksum = this.hash(data);
      chunks.push({ index, data, checksum, size: data.length });
      index++;
    }

    return chunks;
  }

  /**
   * SHA-256 hash of a buffer, returned as hex string.
   */
  hash(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Store a file: chunk it, deduplicate, replicate to N nodes, record metadata.
   * @param {string} fileId
   * @param {Buffer} buffer
   * @param {string} fileName
   * @param {string} mimeType
   * @param {string} ownerId
   */
  async storeFile(fileId, buffer, fileName, mimeType, ownerId) {
    const fileChecksum = this.hash(buffer);
    const rawChunks   = this.splitIntoChunks(buffer);
    const nodes       = nodeRegistry.getHealthyNodes();

    if (nodes.length === 0) throw new Error('No healthy storage nodes available');

    const replicationFactor = Math.min(config.storage.replicationFactor, nodes.length);

    const insertFile = db.prepare(`
      INSERT INTO files (id, owner_id, name, size_bytes, mime_type, checksum)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertChunk = db.prepare(`
      INSERT OR IGNORE INTO chunks (id, file_id, chunk_index, size_bytes, checksum)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertLocation = db.prepare(`
      INSERT OR IGNORE INTO chunk_locations (chunk_id, node_id) VALUES (?, ?)
    `);

    const existingChunk = db.prepare(`
      SELECT id FROM chunks WHERE checksum = ? AND file_id != ? LIMIT 1
    `);

    // Run everything in a single transaction
    const storeTransaction = db.transaction(() => {
      insertFile.run(fileId, ownerId, fileName, buffer.length, mimeType, fileChecksum);

      for (const raw of rawChunks) {
        // Deduplication: check if an identical chunk already exists globally
        const duplicate = existingChunk.get(raw.checksum, fileId);
        const chunkId   = duplicate ? duplicate.id : uuidv4();

        insertChunk.run(chunkId, fileId, raw.index, raw.size, raw.checksum);

        // Decide which nodes will hold this chunk (round-robin spread)
        const targetNodes = this.selectNodes(nodes, raw.index, replicationFactor);

        for (const node of targetNodes) {
          if (!duplicate) {
            // Only write to disk if it's a new chunk
            this.writeChunkToDisk(node.path, chunkId, raw.data);
          }
          insertLocation.run(chunkId, node.id);
          nodeRegistry.updateUsage(node.id, raw.size);
        }
      }
    });

    storeTransaction();

    return {
      fileId,
      checksum: fileChecksum,
      chunkCount: rawChunks.length,
      replicationFactor,
    };
  }

  /**
   * Reassemble a file from its chunks across storage nodes.
   * @param {string} fileId
   * @returns {Buffer}
   */
  async retrieveFile(fileId) {
    const chunks = db.prepare(`
      SELECT c.id, c.chunk_index, c.checksum, c.size_bytes,
             cl.node_id
      FROM chunks c
      JOIN chunk_locations cl ON cl.chunk_id = c.id
      ORDER BY c.chunk_index, cl.stored_at
    `).all();

    // Group by chunk_index, pick first available healthy node
    const chunkMap = new Map();
    for (const row of chunks) {
      if (row.file_id !== fileId) continue; // paranoia check
      if (!chunkMap.has(row.chunk_index)) {
        chunkMap.set(row.chunk_index, []);
      }
      chunkMap.get(row.chunk_index).push(row);
    }

    // Actually use the file-scoped query
    const fileChunks = db.prepare(`
      SELECT c.id, c.chunk_index, c.checksum, cl.node_id
      FROM chunks c
      JOIN chunk_locations cl ON cl.chunk_id = c.id
      WHERE c.file_id = ?
      ORDER BY c.chunk_index, cl.stored_at
    `).all(fileId);

    const byIndex = new Map();
    for (const row of fileChunks) {
      if (!byIndex.has(row.chunk_index)) byIndex.set(row.chunk_index, []);
      byIndex.get(row.chunk_index).push(row);
    }

    const sortedIndexes = [...byIndex.keys()].sort((a, b) => a - b);
    const buffers = [];

    for (const idx of sortedIndexes) {
      const candidates = byIndex.get(idx);
      const data = this.readChunkFromFirstHealthyNode(candidates);
      if (!data) throw new Error(`Chunk ${idx} unavailable on all nodes`);

      // Verify integrity
      const checksum = this.hash(data);
      if (checksum !== candidates[0].checksum) {
        throw new Error(`Chunk ${idx} checksum mismatch — data corrupted`);
      }

      buffers.push(data);
    }

    return Buffer.concat(buffers);
  }

  /**
   * Try each candidate node location until one succeeds.
   */
  readChunkFromFirstHealthyNode(candidates) {
    for (const c of candidates) {
      const node = nodeRegistry.getNode(c.node_id);
      if (!node || !node.healthy) continue;
      const data = this.readChunkFromDisk(node.path, c.id);
      if (data) return data;
    }
    return null;
  }

  /**
   * Persist a chunk buffer to a node's local disk path.
   */
  writeChunkToDisk(nodePath, chunkId, data) {
    const dir = join(nodePath, chunkId.slice(0, 2)); // 2-char prefix sharding
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, chunkId), data);
  }

  /**
   * Read a chunk from disk; returns null if missing.
   */
  readChunkFromDisk(nodePath, chunkId) {
    const filePath = join(nodePath, chunkId.slice(0, 2), chunkId);
    if (!existsSync(filePath)) return null;
    try {
      return readFileSync(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Select `count` nodes for a given chunk using round-robin with spread.
   */
  selectNodes(nodes, chunkIndex, count) {
    const selected = [];
    for (let i = 0; i < count; i++) {
      selected.push(nodes[(chunkIndex + i) % nodes.length]);
    }
    return selected;
  }

  /**
   * Delete all chunk files for a given file ID.
   */
  deleteFileChunks(fileId) {
    const chunks = db.prepare(`
      SELECT c.id, cl.node_id
      FROM chunks c
      JOIN chunk_locations cl ON cl.chunk_id = c.id
      WHERE c.file_id = ?
    `).all(fileId);

    for (const { id: chunkId, node_id } of chunks) {
      const node = nodeRegistry.getNode(node_id);
      if (!node) continue;
      const filePath = join(node.path, chunkId.slice(0, 2), chunkId);
      try { require('fs').unlinkSync(filePath); } catch { /* already gone */ }
    }

    db.prepare('DELETE FROM chunk_locations WHERE chunk_id IN (SELECT id FROM chunks WHERE file_id = ?)').run(fileId);
    db.prepare('DELETE FROM chunks WHERE file_id = ?').run(fileId);
  }
}

export const chunkEngine = new ChunkEngine();
