import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..', process.argv.includes('--dist') ? 'dist' : '.');
const portFlag = process.argv.indexOf('--port');
const port = portFlag === -1 ? 4173 : Number(process.argv[portFlag + 1]);
const hostFlag = process.argv.indexOf('--host');
const host = hostFlag === -1 ? '127.0.0.1' : process.argv[hostFlag + 1];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain' };
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('Outside root');
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    if (!['GET', 'HEAD'].includes(req.method) || !types[extname(file)] || path.includes('/.')) throw new Error('Unsupported');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': `${types[extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, host, () => console.log(`Stable Desk: http://${host}:${port} (${root})`));
