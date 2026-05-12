import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_PORT = 5173;

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);

function parseArgs(argv) {
  const options = {
    host: "127.0.0.1",
    open: false,
    port: DEFAULT_PORT,
    root: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--open") {
      options.open = true;
    } else if (arg === "--host") {
      options.host = argv[index + 1] || options.host;
      index += 1;
    } else if (arg === "--port" || arg === "-p") {
      options.port = Number(argv[index + 1]) || options.port;
      index += 1;
    } else if (arg.startsWith("--port=")) {
      options.port = Number(arg.slice("--port=".length)) || options.port;
    } else if (arg === "--root") {
      options.root = path.resolve(argv[index + 1] || options.root);
      index += 1;
    }
  }

  return options;
}

function send(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(body);
}

async function resolveRequestPath(root, requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const decodedPath = decodeURIComponent(url.pathname);
  const normalizedPath = path.normalize(decodedPath).replace(/^([/\\])+/, "");
  let filePath = path.resolve(root, normalizedPath);

  if (!filePath.startsWith(root)) {
    return null;
  }

  const stat = await fs.stat(filePath).catch(() => null);
  if (stat?.isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  return filePath;
}

function createHandler(root) {
  return async (request, response) => {
    if (!request.url || !["GET", "HEAD"].includes(request.method || "")) {
      send(response, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
      return;
    }

    const filePath = await resolveRequestPath(root, request.url);
    if (!filePath) {
      send(response, 403, "Forbidden");
      return;
    }

    try {
      const body = await fs.readFile(filePath);
      const contentType = mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": body.byteLength,
        "Content-Type": contentType,
      });
      if (request.method === "HEAD") {
        response.end();
      } else {
        response.end(body);
      }
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "EISDIR") {
        send(response, 404, "Not Found");
      } else {
        send(response, 500, "Internal Server Error");
      }
    }
  };
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(server.address());
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

export async function startStaticServer(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const host = options.host || "127.0.0.1";
  const preferredPort = Number(options.port ?? DEFAULT_PORT);
  const maxAttempts = preferredPort === 0 ? 1 : 20;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const port = preferredPort === 0 ? 0 : preferredPort + attempt;
    const server = http.createServer(createHandler(root));

    try {
      const address = await listen(server, host, port);
      const actualPort = typeof address === "object" && address ? address.port : port;
      return {
        close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
        host,
        port: actualPort,
        root,
        server,
        url: `http://${host}:${actualPort}/`,
      };
    } catch (error) {
      server.close();
      if (error?.code !== "EADDRINUSE" || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw new Error("No available local port found.");
}

export function openUrl(url) {
  const command =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const server = await startStaticServer(options);
  console.log(`Local server: ${server.url}`);
  console.log(`Root: ${server.root}`);
  console.log("Press Ctrl+C to stop.");

  if (options.open) {
    openUrl(server.url);
  }
}

const isCliEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCliEntry) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
