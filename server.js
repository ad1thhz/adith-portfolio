// Portfolio server (no npm dependencies; needs Node 22.5+).
// Serves the site and stores likes in a SQLite database file (portfolio.db).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, 'portfolio.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Anonymous',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS stats (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO stats (key, value) VALUES ('like_count', 0);
`);

const insertLike = db.prepare('INSERT INTO likes (name) VALUES (?)');
const bumpCount = db.prepare("UPDATE stats SET value = value + 1 WHERE key = 'like_count'");
const readCount = db.prepare("SELECT value FROM stats WHERE key = 'like_count'");
const getCount = () => Number(readCount.get().value);

function addLike(name) {
  db.exec('BEGIN');
  try { insertLike.run(name); bumpCount.run(); db.exec('COMMIT'); }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.pdf': 'application/pdf'
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  if (req.method === 'GET' && p === '/api/likes') return json(res, 200, { count: getCount() });

  if (req.method === 'POST' && p === '/api/like') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2048) req.destroy(); });
    req.on('end', () => {
      let name = '';
      try { const d = JSON.parse(body || '{}'); if (typeof d.name === 'string') name = d.name.trim().slice(0, 60); }
      catch (e) { return json(res, 400, { error: 'Bad request' }); }
      if (!name) name = 'Anonymous'; // visitor pressed Skip
      try { addLike(name); } catch (e) { return json(res, 500, { error: 'Database error' }); }
      json(res, 200, { count: getCount() });
    });
    return;
  }

  // Static files: only the site itself, never the database or server code.
  if (req.method === 'GET') {
    if (p === '/' || p === '/index.html') return serveFile(res, path.join(__dirname, 'index.html'));
    if (p === '/AdithResume.pdf') return serveFile(res, path.join(__dirname, 'AdithResume.pdf'));
    if (p.startsWith('/Images/')) {
      const file = path.join(__dirname, p);
      if (file.startsWith(path.join(__dirname, 'Images') + path.sep)) return serveFile(res, file);
    }
  }
  res.writeHead(404); res.end('Not found');
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Portfolio running at http://localhost:${port}`));
