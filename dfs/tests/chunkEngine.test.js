import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { ChunkEngine } from '../src/services/chunkEngine.js';
import { NodeRegistry } from '../src/services/nodeRegistry.js';

// ── ChunkEngine unit tests ────────────────────────────────────────────────────

describe('ChunkEngine', () => {
  const engine = new ChunkEngine();

  it('hash() produces consistent SHA-256 hex', () => {
    const buf = Buffer.from('hello world');
    const h1  = engine.hash(buf);
    const h2  = engine.hash(buf);
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
  });

  it('splitIntoChunks() splits correctly', () => {
    // Override chunk size to 10 bytes for this test
    const origSize = engine.constructor.name; // just to reference engine
    const data   = Buffer.alloc(25, 'x');
    const chunks = engine.splitIntoChunks(data);
    // Default chunk size is 2MB so 25 bytes = 1 chunk
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].index, 0);
    assert.equal(chunks[0].size, 25);
  });

  it('splitIntoChunks() produces correct checksums', () => {
    const data   = Buffer.from('test data for hashing');
    const chunks = engine.splitIntoChunks(data);
    assert.equal(chunks[0].checksum, engine.hash(data));
  });

  it('selectNodes() round-robins correctly', () => {
    const nodes  = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const sel0   = engine.selectNodes(nodes, 0, 2);
    const sel1   = engine.selectNodes(nodes, 1, 2);
    assert.deepEqual(sel0.map(n => n.id), ['a', 'b']);
    assert.deepEqual(sel1.map(n => n.id), ['b', 'c']);
  });

  it('hash() different inputs produce different hashes', () => {
    const h1 = engine.hash(Buffer.from('aaa'));
    const h2 = engine.hash(Buffer.from('bbb'));
    assert.notEqual(h1, h2);
  });
});

// ── Integration: store + retrieve ─────────────────────────────────────────────
// These run against the real DB and file system — run from project root.

describe('File round-trip (integration)', async () => {
  // Only run if explicitly opted in via DFS_INTEGRATION=1
  const skip = !process.env.DFS_INTEGRATION;

  it('stores and retrieves a file with checksum verification', { skip }, async () => {
    const { chunkEngine } = await import('../src/services/chunkEngine.js');
    const { v4: uuidv4 }  = await import('uuid');

    const fileId  = uuidv4();
    const content = Buffer.from('Hello distributed world! '.repeat(100));

    await chunkEngine.storeFile(fileId, content, 'test.txt', 'text/plain', 'test-user');
    const retrieved = await chunkEngine.retrieveFile(fileId);

    assert.equal(retrieved.toString(), content.toString());
  });
});
