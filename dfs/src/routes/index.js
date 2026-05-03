import { Router } from 'express';
import multer from 'multer';
import { register, login, me } from '../controllers/authController.js';
import { uploadFile, downloadFile, listFiles, getFileMeta, deleteFile } from '../controllers/fileController.js';
import { listNodes, setNodeHealth, triggerReplication, systemStats } from '../controllers/adminController.js';
import { authenticate } from '../middleware/auth.js';

const router  = Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500 MB max

// ── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/register', register);
router.post('/auth/login',    login);
router.get('/auth/me',        authenticate, me);

// ── Files ────────────────────────────────────────────────────────────────────
router.post  ('/files',          authenticate, upload.single('file'), uploadFile);
router.get   ('/files',          authenticate, listFiles);
router.get   ('/files/:id',      authenticate, downloadFile);
router.get   ('/files/:id/meta', authenticate, getFileMeta);
router.delete('/files/:id',      authenticate, deleteFile);

// ── Admin ────────────────────────────────────────────────────────────────────
router.get ('/admin/nodes',               listNodes);
router.post('/admin/nodes/:id/health',    setNodeHealth);
router.post('/admin/replicate',           triggerReplication);
router.get ('/admin/stats',               systemStats);

// ── Health ───────────────────────────────────────────────────────────────────
router.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

export default router;
