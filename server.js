// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');

let DB_PATH = path.join(__dirname, 'db.json');
const PORT = process.env.PORT || 3000;

function setDbPath(p) { DB_PATH = p; }           // test helper: point DB to temp file
function resetDbFile() { writeDB([]); }         // test helper: clear DB

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2), 'utf8');
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data;
  } catch (err) {
    console.error('readDB error:', err);
    return [];
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

const app = express();

app.use(express.json());
// simple request logger
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.url);
  next();
});

// serve static files from public (only when running normally)
app.use(express.static(path.join(__dirname, 'public')));
// serve uploaded media including mp4 files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/**
 * Validate media payload.
 * Accepts either a fresh payload (POST) or a merged object (existing + payload for PUT).
 * Returns { ok: true } or { ok: false, error: 'message' }.
 */
function validateMediaPayload(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'payload required' };

  // title required and non-empty
  if (!payload.title || !String(payload.title).trim()) {
    return { ok: false, error: 'title is required' };
  }

  // type must be image or video
  const t = String(payload.type || '').toLowerCase();
  if (!t || (t !== 'image' && t !== 'video')) {
    return { ok: false, error: "type must be 'image' or 'video'" };
  }

  // require mediaUrls array or mediaUrl single string
  const hasArray = Array.isArray(payload.mediaUrls) && payload.mediaUrls.length > 0;
  const hasSingle = payload.mediaUrl && String(payload.mediaUrl).trim();
  if (!hasArray && !hasSingle) {
    return { ok: false, error: 'provide mediaUrls (array) for images or mediaUrl for single media' };
  }

  // status if present must be draft or published
  if (payload.status && !['draft', 'published'].includes(String(payload.status))) {
    return { ok: false, error: "status must be 'draft' or 'published'" };
  }

  return { ok: true };
}

// --- PUBLIC API (read-only) ---
app.get('/api/public/media', (req, res) => {
  try {
    const data = readDB();
    const published = data.filter(i => String(i.status || '').toLowerCase() === 'published');
    res.json(published);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to read db' });
  }
});

// GET all media (admin)
app.get('/api/media', (req, res) => {
  try {
    const data = readDB();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to read db' });
  }
});

// GET one by id
app.get('/api/media/:id', (req, res) => {
  try {
    const id = String(req.params.id);
    const data = readDB();
    const item = data.find(x => String(x.id) === id);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST create new
app.post('/api/media', (req, res) => {
  try {
    const payload = req.body || {};
    // validate payload
    const v = validateMediaPayload(payload);
    if (!v.ok) return res.status(400).json({ error: v.error });

    const data = readDB();
    const nextId = data.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
    const now = new Date().toISOString();

    // ensure arrays exist for mediaUrls if single mediaUrl provided
    let mediaUrls = [];
    if (Array.isArray(payload.mediaUrls)) mediaUrls = payload.mediaUrls.slice();
    else if (payload.mediaUrl) mediaUrls = [payload.mediaUrl];

    // prepare mediaMeta: if provided and array use it, otherwise create same-length empty objects
    let mediaMeta = Array.isArray(payload.mediaMeta) ? payload.mediaMeta.slice() : [];
    if (!mediaMeta.length && mediaUrls.length) {
      mediaMeta = mediaUrls.map(() => ({}));
    }

    const item = {
      id: nextId,
      type: String(payload.type).toLowerCase(),
      title: String(payload.title).trim(),
      description: payload.description || '',
      status: payload.status || 'draft',
      tags: Array.isArray(payload.tags) ? payload.tags : (payload.tags ? [String(payload.tags)] : []),
      mediaUrls: mediaUrls,
      mediaUrl: !mediaUrls.length && payload.mediaUrl ? payload.mediaUrl : undefined,
      thumbnailUrl: payload.thumbnailUrl || '',
      mediaMeta: mediaMeta,
      createdAt: now,
      updatedAt: now
    };

    data.push(item);
    writeDB(data);
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to create item' });
  }
});

// PUT update existing
app.put('/api/media/:id', (req, res) => {
  try {
    const id = String(req.params.id);
    const data = readDB();
    const idx = data.findIndex(x => String(x.id) === id);
    if (idx < 0) return res.status(404).json({ error: 'not found' });

    const payload = req.body || {};
    const existing = data[idx];
    // Merge existing and payload to validate the final object
    const mergedForValidation = Object.assign({}, existing, payload);

    const v = validateMediaPayload(mergedForValidation);
    if (!v.ok) return res.status(400).json({ error: v.error });

    const now = new Date().toISOString();

    // build updated item by merging allowed fields
    const updated = Object.assign({}, existing);

    if (typeof payload.title !== 'undefined') updated.title = payload.title;
    if (typeof payload.type !== 'undefined') updated.type = payload.type;
    if (typeof payload.description !== 'undefined') updated.description = payload.description;
    if (typeof payload.status !== 'undefined') updated.status = payload.status;
    if (typeof payload.tags !== 'undefined') updated.tags = Array.isArray(payload.tags) ? payload.tags : (payload.tags ? [String(payload.tags)] : []);
    if (typeof payload.thumbnailUrl !== 'undefined') updated.thumbnailUrl = payload.thumbnailUrl;

    // handle mediaUrls/mediaUrl
    let mediaUrls = [];
    if (typeof payload.mediaUrls !== 'undefined') {
      if (Array.isArray(payload.mediaUrls)) mediaUrls = payload.mediaUrls.slice();
      else if (payload.mediaUrls && typeof payload.mediaUrls === 'string') mediaUrls = payload.mediaUrls.split(',').map(s => s.trim()).filter(Boolean);
      updated.mediaUrls = mediaUrls;
      if (mediaUrls.length === 0) delete updated.mediaUrls;
    }
    if (typeof payload.mediaUrl !== 'undefined') {
      updated.mediaUrl = payload.mediaUrl;
    }

    // mediaMeta resize logic
    if (typeof payload.mediaMeta !== 'undefined' && Array.isArray(payload.mediaMeta)) {
      updated.mediaMeta = payload.mediaMeta.slice();
    } else {
      const urls = Array.isArray(updated.mediaUrls) ? updated.mediaUrls : (updated.mediaUrl ? [updated.mediaUrl] : []);
      const meta = Array.isArray(updated.mediaMeta) ? updated.mediaMeta.slice() : [];
      if (urls.length && meta.length !== urls.length) {
        const newMeta = urls.map((u, i) => (meta[i] || {}));
        updated.mediaMeta = newMeta;
      }
    }

    updated.updatedAt = now;
    data[idx] = updated;
    writeDB(data);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to update item' });
  }
});

// DELETE
app.delete('/api/media/:id', (req, res) => {
  try {
    const id = String(req.params.id);
    let data = readDB();
    const idx = data.findIndex(x => String(x.id) === id);
    if (idx < 0) return res.status(404).json({ error: 'not found' });
    const removed = data.splice(idx, 1)[0];
    writeDB(data);
    res.json({ ok: true, removed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to delete' });
  }
});

// fallback to gallery at root
app.get('/', (req, res) => {
  res.redirect('/gallery.html');
});

// only start server when run directly, not when required by tests
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

// exports for tests
module.exports = { app, setDbPath, resetDbFile };
