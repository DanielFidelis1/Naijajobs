/* Tiny static file server bound to 127.0.0.1 only.
   The site uses absolute paths ("/sw.js", "/icons/...") and a service worker,
   so it must be served from a real origin rather than file://. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
    ".ico": "image/x-icon", ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"
};

function start(rootDir, port) {
    const root = path.resolve(rootDir);
    const server = http.createServer((req, res) => {
        try {
            let urlPath = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
            if (urlPath === "/") urlPath = "/index.html";
            const file = path.resolve(root, "." + urlPath);

            // block path traversal
            if (file !== root && !file.startsWith(root + path.sep)) {
                res.writeHead(403); return res.end("Forbidden");
            }
            fs.readFile(file, (err, data) => {
                if (err) {
                    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
                    return res.end("Not found");
                }
                res.writeHead(200, {
                    "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
                    "Cache-Control": "no-cache"
                });
                res.end(data);
            });
        } catch (e) {
            res.writeHead(400); res.end("Bad request");
        }
    });
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve(server));
    });
}

module.exports = { start };
