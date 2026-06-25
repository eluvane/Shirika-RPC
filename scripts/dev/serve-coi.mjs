import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultPath = resolve(rootDir, 'demo/browser/index.html');
const mimeTypes = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.mjs', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
]);
const server = http.createServer(async (request, response) => {
    try {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const pathname = decodeURIComponent(url.pathname);
        const filePath = pathname === '/' ? defaultPath : resolve(rootDir, `.${normalize(pathname)}`);
        if (!filePath.startsWith(rootDir)) {
            response.writeHead(403);
            response.end('Forbidden');
            return;
        }
        const fileStats = await stat(filePath);
        const resolvedPath = fileStats.isDirectory() ? join(filePath, 'index.html') : filePath;
        const stream = createReadStream(resolvedPath);
        response.writeHead(200, {
            'Content-Type': mimeTypes.get(extname(resolvedPath)) ?? 'application/octet-stream',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cache-Control': 'no-store',
        });
        stream.pipe(response);
    } catch {
        response.writeHead(404, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        });
        response.end('Not found');
    }
});
server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (address && typeof address === 'object') {
        console.log(`COI demo server: http://127.0.0.1:${address.port}/demo/browser/`);
    }
});
