// Tiny static file server with SPA fallback (unknown paths → index.html).
const http = require('http');
const fs = require('fs');
const path = require('path');

const [root, port] = [process.argv[2], Number(process.argv[3])];
const types = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(root, urlPath);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(root, 'index.html');
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${root} on :${port}`));
