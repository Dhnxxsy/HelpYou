import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { api } from './routes/api.js';
import { info } from './logger.js';

dotenv.config();

export interface ServerStartOptions {
  port?: number;
  host?: string;
  base?: string;
  data?: string;
}

export async function startServer(opts: ServerStartOptions = {}) {
  const requestedPort = opts.port ?? Number(process.env.PORT || 3010);
  const host = opts.host;
  const base = opts.base ?? process.env.FO_BASE;
  const data = opts.data ?? process.env.FO_DATA;

  if (base) process.env.FO_BASE = base;
  if (data) process.env.FO_DATA = data;

  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  app.use('/api', api);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  const distDir = base ? path.join(base, 'dist') : path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  let port = requestedPort;
  let server: ReturnType<typeof app.listen> | null = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      server = await new Promise((resolve, reject) => {
        const s = host ? app.listen(port, host) : app.listen(port);
        s.once('listening', () => resolve(s));
        s.once('error', reject);
      });
      break;
    } catch (err) {
      if (err && (err as NodeJS.ErrnoException).code === 'EADDRINUSE' && port !== requestedPort) {
        port += 1;
        continue;
      }
      if (err && (err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        port = requestedPort + 1;
        continue;
      }
      throw err;
    }
  }

  if (!server) throw new Error(`Could not bind a port near ${requestedPort}`);

  const baseUrl = `http://${host || 'localhost'}:${port}`;
  return { server, port, url: baseUrl };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  startServer({}).then(({ url, port }) => {
    info(`HelpYou server running at ${url}`);
    info(`Platform: ${process.platform} | Node: ${process.version}`);
  });
}