# 🗄️ Distributed File Storage System

A production-grade distributed file storage backend built with **Node.js**. Files are split into chunks, deduplicated using SHA-256 hashing, and replicated across multiple storage nodes for fault tolerance — similar to how Google Drive and AWS S3 work under the hood.

---

## ✨ Features

- **File Chunking** — Files split into configurable fixed-size pieces (default 2MB)
- **Content-Addressed Deduplication** — Identical chunks stored only once using SHA-256
- **Replication** — Every chunk written to 3 nodes for fault tolerance
- **Integrity Verification** — Checksum validated on every download
- **Replication Watcher** — Background process that auto-heals under-replicated chunks
- **JWT Authentication** — Secure stateless auth with 7-day tokens
- **Rate Limiting** — Per-IP request throttling
- **Soft Delete** — Files marked deleted, chunks preserved
- **Admin Dashboard API** — Node health, stats, force re-replication

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | SQLite (better-sqlite3) |
| Auth | JWT + bcryptjs |
| File Handling | Multer |
| Background Jobs | Native setInterval |
| Hashing | Node.js crypto (SHA-256) |

---

## 📁 Project Structure

```
dfs/
├── src/
│   ├── server.js                    # Entry point
│   ├── config/index.js              # All configuration
│   ├── models/db.js                 # SQLite schema
│   ├── services/
│   │   ├── chunkEngine.js           # Split, hash, store, retrieve
│   │   ├── nodeRegistry.js          # Node health tracking
│   │   └── replicationWatcher.js   # Background healer
│   ├── controllers/
│   │   ├── authController.js        # Register, login
│   │   ├── fileController.js        # Upload, download, list
│   │   └── adminController.js       # Stats, node management
│   ├── middleware/auth.js           # JWT verification
│   └── routes/index.js             # All API routes
├── storage/
│   ├── node-a/                      # Storage node 1
│   ├── node-b/                      # Storage node 2
│   └── node-c/                      # Storage node 3
├── data/
│   └── metadata.db                  # SQLite database
└── .env                             # Configuration
```

---

## 🚀 Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/distributed-file-storage.git
cd distributed-file-storage/dfs

# 2. Install dependencies
npm install

# 3. Start the server
npm run dev

# Server runs at http://localhost:3000
```

---

## 📡 API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, get JWT token |
| GET | `/api/auth/me` | Current user info |

### Files

> All file endpoints require `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files` | Upload a file |
| GET | `/api/files` | List all your files |
| GET | `/api/files/:id` | Download a file |
| GET | `/api/files/:id/meta` | File metadata + chunk map |
| DELETE | `/api/files/:id` | Delete a file |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | System-wide statistics |
| GET | `/api/admin/nodes` | Node health status |
| POST | `/api/admin/nodes/:id/health` | Toggle node health |
| POST | `/api/admin/replicate` | Trigger replication check |

---

## 💡 How It Works

```
Upload Flow:
  File → Split into 2MB chunks → SHA-256 hash each chunk
       → Check for duplicates → Write to node-a, node-b, node-c
       → Save metadata to SQLite → Return success

Download Flow:
  Request → Lookup chunk locations in DB → Read chunks from nodes
          → Verify checksums → Reassemble → Return file
```

### Deduplication
Every chunk is hashed with SHA-256. If the same chunk already exists, it's referenced instead of stored again — saving significant disk space.

### Fault Tolerance
Each chunk is replicated to all 3 nodes. If a node goes offline, the replication watcher detects it and automatically re-replicates missing chunks to healthy nodes.

---

## ⚙️ Configuration

Edit `.env` to customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | `dev-secret` | JWT signing secret |
| `CHUNK_SIZE_MB` | `2` | Chunk size in MB |
| `REPLICATION_FACTOR` | `3` | Copies per chunk |
| `NODE_IDS` | `node-a,node-b,node-c` | Storage node IDs |

---

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests
DFS_INTEGRATION=1 npm test
```

---

## 🔬 Key Concepts Demonstrated

- **Consistent round-robin placement** — Chunk N goes to nodes `(N % nodeCount)`, `(N+1 % nodeCount)` ...
- **Content-addressed storage** — SHA-256 of chunk data is the dedup key
- **Read repair** — Retrieval falls over to the next replica automatically if one node is down
- **WAL mode SQLite** — Concurrent reads while writes are in progress
- **2-char prefix sharding** — Avoids directories with millions of files

---

## 🌍 Real World Comparison

| Feature | This Project | AWS S3 / Google Drive |
|---------|-------------|----------------------|
| Chunking | ✅ 2MB chunks | ✅ Multi-part upload |
| Replication | ✅ 3 local nodes | ✅ 3+ data centers |
| Deduplication | ✅ SHA-256 | ✅ SHA-256 |
| Auth | ✅ JWT | ✅ IAM / OAuth |
| Metadata DB | ✅ SQLite | ✅ DynamoDB |

---

## 🛣️ Roadmap

- [ ] Replace SQLite with PostgreSQL / CockroachDB
- [ ] Presigned download URLs
- [ ] Erasure coding (Reed-Solomon) instead of full replication
- [ ] Prometheus metrics endpoint
- [ ] Frontend dashboard (React)
- [ ] File versioning
- [ ] Garbage collection for deleted chunks

---

## 👨‍💻 Author

**Rishi** — Built as a backend systems project to learn distributed storage concepts.

---

## 📄 License

MIT
