# Distributed File Storage

A production-grade distributed file storage system built with Node.js. Files are split into chunks, deduplicated by content hash, and replicated across multiple storage nodes for fault tolerance.

## Architecture

```
Client
  │
  ▼
API Gateway (Express + JWT + Rate Limiting)
  │                        │
  ▼                        ▼
Metadata Service       Chunk Engine
(SQLite)               ┌─────────────────┐
  │                    │ Split → Hash     │
  │                    │ Deduplicate      │
  │                    └────┬────────────┘
  │                         │  replicated to N nodes
  │                    ┌────▼────┐ ┌────────┐ ┌────────┐
  │                    │ Node A  │ │ Node B │ │ Node C │
  │                    └─────────┘ └────────┘ └────────┘
  │
Supporting Services
  ├── Replication Watcher (re-replicates on node failure)
  ├── Job Queue (background tasks)
  └── Redis Cache (hot metadata)
```

## Features

- **Chunked storage** — files split into configurable fixed-size pieces (default 2 MB)
- **Content-addressed deduplication** — identical chunks stored only once (SHA-256)
- **Configurable replication** — each chunk written to N nodes (default 3)
- **Integrity verification** — checksum validated on every download
- **Replication watcher** — background process that heals under-replicated chunks
- **Soft delete** — files marked deleted, chunks preserved for GC
- **Versioning schema** — ready for file version history
- **Rate limiting** — per-IP request throttling
- **JWT authentication** — stateless auth with 7-day tokens

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure (optional — defaults work out of the box)
cp .env .env.local
# Edit .env.local as needed

# 3. Start the server
npm run dev

# Server starts at http://localhost:3000
```

## API Reference

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |
| GET  | `/api/auth/me` | Current user + quota |

**Register / Login body:**
```json
{ "username": "alice", "password": "secret123" }
```

**Response:**
```json
{
  "token": "eyJ...",
  "user": { "id": "uuid", "username": "alice" }
}
```

### Files

All file endpoints require `Authorization: Bearer <token>`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/files` | Upload a file (multipart `file` field) |
| GET  | `/api/files` | List your files (`?page=1&limit=20`) |
| GET  | `/api/files/:id` | Download a file |
| GET  | `/api/files/:id/meta` | File metadata + chunk map |
| DELETE | `/api/files/:id` | Soft-delete a file |

**Upload example (curl):**
```bash
curl -X POST http://localhost:3000/api/files \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./myfile.pdf"
```

**Upload response:**
```json
{
  "message": "File uploaded successfully",
  "file": {
    "id": "uuid",
    "name": "myfile.pdf",
    "size": 1048576,
    "mimeType": "application/pdf",
    "checksum": "sha256hex",
    "version": 1,
    "createdAt": "2024-01-01T00:00:00"
  },
  "chunks": 1,
  "replicationFactor": 3
}
```

**Chunk map (`/meta`) response:**
```json
{
  "file": { "..." },
  "chunks": [
    {
      "index": 0,
      "id": "chunk-uuid",
      "size": 1048576,
      "checksum": "sha256hex",
      "nodes": ["node-a", "node-b", "node-c"]
    }
  ]
}
```

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/admin/stats` | System-wide stats |
| GET  | `/api/admin/nodes` | Node registry + health |
| POST | `/api/admin/nodes/:id/health` | Toggle node health `{"healthy": false}` |
| POST | `/api/admin/replicate` | Trigger replication check immediately |

**Simulate a node failure:**
```bash
# Mark node-b as unhealthy
curl -X POST http://localhost:3000/api/admin/nodes/node-b/health \
  -H "Content-Type: application/json" \
  -d '{"healthy": false}'

# Trigger re-replication to node-a and node-c
curl -X POST http://localhost:3000/api/admin/replicate
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | `dev-secret` | JWT signing secret |
| `CHUNK_SIZE_MB` | `2` | Chunk size in megabytes |
| `STORAGE_BASE_PATH` | `./storage` | Root path for node directories |
| `REPLICATION_FACTOR` | `3` | Number of nodes per chunk |
| `NODE_IDS` | `node-a,node-b,node-c` | Comma-separated node IDs |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |

## Storage Layout

```
storage/
  node-a/
    ab/          ← 2-char prefix sharding
      abcdef...  ← chunk file (raw bytes)
    c3/
      c3de12...
  node-b/
    ...
  node-c/
    ...
data/
  metadata.db    ← SQLite: files, chunks, locations, users
```

## Running Tests

```bash
# Unit tests (no server needed)
npm test

# Integration tests (requires running server + DB)
DFS_INTEGRATION=1 npm test
```

## Key Concepts Demonstrated

- **Consistent round-robin placement** — chunk N goes to nodes `(N % nodeCount)`, `(N+1 % nodeCount)`, ...
- **Content-addressed storage** — SHA-256 of chunk data is the dedup key
- **Read repair** — if one node is down, retrieval falls over to the next replica automatically
- **WAL mode SQLite** — concurrent reads while writes are in progress
- **2-char prefix sharding** — avoids directories with millions of files

## Next Steps / Extensions

- [ ] Replace SQLite with CockroachDB or Postgres for true horizontal scaling
- [ ] Add presigned download URLs (time-limited, no auth token needed)
- [ ] Implement erasure coding (Reed-Solomon) instead of full replication
- [ ] Bloom filter for fast dedup lookups at millions of chunks
- [ ] Prometheus metrics endpoint (`/metrics`)
- [ ] gRPC interface for node-to-node communication
- [ ] Garbage collection for soft-deleted file chunks
