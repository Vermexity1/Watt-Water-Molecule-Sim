import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PORT = process.env.PORT || 8080;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function send(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, { "Content-Type": type });
  response.end(body);
}

const server = http.createServer((request, response) => {
  const rawPath = request.url === "/" ? "/index.html" : request.url;
  const safePath = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    send(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(response, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    send(response, 200, data, MIME_TYPES[extension] || "application/octet-stream");
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(`Port ${PORT} is already in use.`);
    console.log(`The lab may already be running at http://127.0.0.1:${PORT}/`);
    console.log("If you want another copy, run with a different port.");
    console.log("PowerShell example: $env:PORT=8081; npm start");
    process.exit(0);
  }

  console.error(error);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Molecular Thermodynamics Lab running at http://127.0.0.1:${PORT}`);
});
