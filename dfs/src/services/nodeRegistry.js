import { mkdirSync } from 'fs';
import { config } from '../config/index.js';

/**
 * NodeRegistry tracks in-memory state of all storage nodes.
 * In a production system this would sync to a distributed store (etcd, Consul).
 */
class NodeRegistry {
  constructor() {
    this.nodes = new Map();
    this._init();
  }

  _init() {
    for (const node of config.nodes) {
      mkdirSync(node.path, { recursive: true });
      this.nodes.set(node.id, { ...node });
    }
    console.log(`[NodeRegistry] Initialized ${this.nodes.size} node(s)`);
  }

  /** Return all nodes */
  all() {
    return [...this.nodes.values()];
  }

  /** Return only nodes currently marked healthy */
  getHealthyNodes() {
    return this.all().filter(n => n.healthy);
  }

  /** Get a single node by ID */
  getNode(id) {
    return this.nodes.get(id) || null;
  }

  /** Mark a node as healthy or unhealthy */
  setHealth(nodeId, healthy) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.healthy = healthy;
      console.log(`[NodeRegistry] Node ${nodeId} marked ${healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    }
  }

  /** Increment used bytes on a node after a chunk write */
  updateUsage(nodeId, addedBytes) {
    const node = this.nodes.get(nodeId);
    if (node) node.usedBytes += addedBytes;
  }

  /** Summary stats for the /admin/nodes endpoint */
  summary() {
    return this.all().map(n => ({
      id:        n.id,
      healthy:   n.healthy,
      usedMB:    +(n.usedBytes / 1024 / 1024).toFixed(2),
      path:      n.path,
    }));
  }
}

export const nodeRegistry = new NodeRegistry();
