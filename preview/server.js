const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.json': 'application/json'
};

http.createServer((req, res) => {
  const clean = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, clean);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('no');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('missing');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    });
    res.end(data);
  });
}).listen(8791, '127.0.0.1', () => console.log('listening on 8791'));
