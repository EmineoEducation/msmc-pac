// api/progress.js — Upstash Redis progress tracker
// GET  /api/progress?hash=xxx       → renvoie { bc1, bc2, bc3, bc5, bc6 } statuts
// POST /api/progress                → body { hash, bloc, status } → met à jour

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TITRE       = 'msmc';
const BLOCS       = ['bc1', 'bc2', 'bc3', 'bc5', 'bc6'];
const TTL         = 60 * 60 * 24 * 90; // 90 jours

async function redis(cmd) {
  const res = await fetch(`${REDIS_URL}/${cmd}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

async function redisSet(key, value, ttl) {
  const res = await fetch(`${REDIS_URL}/set/${key}/${encodeURIComponent(value)}/EX/${ttl}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: 'Redis non configuré' });
  }

  // GET — récupère tous les statuts du hash
  if (req.method === 'GET') {
    const { hash } = req.query;
    if (!hash) return res.status(400).json({ error: 'hash manquant' });

    const progress = {};
    for (const bloc of BLOCS) {
      const key = `${TITRE}:student:${hash}:${bloc}`;
      const val = await redis(`get/${key}`);
      progress[bloc] = val || 'available';
    }
    return res.status(200).json({ progress });
  }

  // POST — met à jour un statut
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'JSON invalide' });
    }
    const { hash, bloc, status } = body || {};
    if (!hash || !bloc || !status) {
      return res.status(400).json({ error: 'hash, bloc et status requis' });
    }
    if (!BLOCS.includes(bloc)) {
      return res.status(400).json({ error: `bloc inconnu: ${bloc}` });
    }
    const allowed = ['available', 'completed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status invalide: ${status}` });
    }
    const key = `${TITRE}:student:${hash}:${bloc}`;
    await redisSet(key, status, TTL);
    return res.status(200).json({ ok: true, key, status });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
