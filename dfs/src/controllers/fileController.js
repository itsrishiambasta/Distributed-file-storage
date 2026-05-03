import { v4 as uuidv4 } from 'uuid';
import db from '../models/db.js';
import { chunkEngine } from '../services/chunkEngine.js';

/** Upload a new file */
export async function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const fileId   = uuidv4();
  const ownerId  = req.user.id;
  const { originalname, mimetype, buffer } = req.file;

  try {
    const result = await chunkEngine.storeFile(fileId, buffer, originalname, mimetype, ownerId);
    const file   = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);

    res.status(201).json({
      message: 'File uploaded successfully',
      file: sanitizeFile(file),
      chunks: result.chunkCount,
      replicationFactor: result.replicationFactor,
    });
  } catch (err) {
    console.error('[Upload] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** Download a file by ID */
export async function downloadFile(req, res) {
  const file = db.prepare(`
    SELECT * FROM files WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
  `).get(req.params.id, req.user.id);

  if (!file) return res.status(404).json({ error: 'File not found' });

  try {
    const buffer = await chunkEngine.retrieveFile(file.id);

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-File-Checksum', file.checksum);
    res.send(buffer);
  } catch (err) {
    console.error('[Download] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** List files owned by the authenticated user */
export function listFiles(req, res) {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const files = db.prepare(`
    SELECT * FROM files
    WHERE owner_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, parseInt(limit), offset);

  const total = db.prepare(`
    SELECT COUNT(*) AS count FROM files WHERE owner_id = ? AND deleted_at IS NULL
  `).get(req.user.id).count;

  res.json({ files: files.map(sanitizeFile), total, page: parseInt(page), limit: parseInt(limit) });
}

/** Get metadata about a specific file including chunk info */
export function getFileMeta(req, res) {
  const file = db.prepare(`
    SELECT * FROM files WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
  `).get(req.params.id, req.user.id);

  if (!file) return res.status(404).json({ error: 'File not found' });

  const chunks = db.prepare(`
    SELECT c.id, c.chunk_index, c.size_bytes, c.checksum,
           GROUP_CONCAT(cl.node_id) AS nodes
    FROM chunks c
    JOIN chunk_locations cl ON cl.chunk_id = c.id
    WHERE c.file_id = ?
    GROUP BY c.id
    ORDER BY c.chunk_index
  `).all(file.id);

  res.json({
    file: sanitizeFile(file),
    chunks: chunks.map(c => ({
      index:     c.chunk_index,
      id:        c.id,
      size:      c.size_bytes,
      checksum:  c.checksum,
      nodes:     c.nodes.split(','),
    })),
  });
}

/** Soft-delete a file */
export function deleteFile(req, res) {
  const file = db.prepare(`
    SELECT * FROM files WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
  `).get(req.params.id, req.user.id);

  if (!file) return res.status(404).json({ error: 'File not found' });

  db.prepare(`UPDATE files SET deleted_at = datetime('now') WHERE id = ?`).run(file.id);

  res.json({ message: 'File deleted', id: file.id });
}

/** Strip internal fields before sending to client */
function sanitizeFile(file) {
  return {
    id:        file.id,
    name:      file.name,
    size:      file.size_bytes,
    mimeType:  file.mime_type,
    checksum:  file.checksum,
    version:   file.version,
    createdAt: file.created_at,
    updatedAt: file.updated_at,
  };
}
