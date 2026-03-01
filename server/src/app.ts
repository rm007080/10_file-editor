import express from 'express';
import cors from 'cors';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ErrorResponse, HealthResponse } from '@app/shared';
import { detectPlatform } from './utils/pathConverter.js';
import { filesRouter } from './routes/files.js';
import { renameRouter } from './routes/rename.js';
import { undoRouter } from './routes/undo.js';
import { presetsRouter } from './routes/presets.js';
import {
  ensureUndoDirectory,
  recoverIncompleteJournals,
  _setUndoDirectoryForTest,
} from './services/journalService.js';
import { ensurePresetsDirectory, setPresetsDirectory } from './services/presetService.js';

// --- Types ---

export interface ServerOptions {
  dataDir?: string;
  host?: string;
  port?: number;
  enableCors?: boolean;
  corsOrigin?: string;
}

// --- Data directory configuration ---

export function configureDataDirs(dataDir?: string): void {
  if (!dataDir) return;
  _setUndoDirectoryForTest(path.join(dataDir, 'undo'));
  setPresetsDirectory(path.join(dataDir, 'presets'));
}

// --- Express app factory ---

export function createExpressApp(options: ServerOptions = {}): express.Express {
  const app = express();

  if (options.enableCors !== false) {
    app.use(cors(options.corsOrigin ? { origin: options.corsOrigin } : undefined));
  }
  app.use(express.json());

  // --- Routes ---

  const platformInfo = detectPlatform();

  app.get('/api/health', (_req, res) => {
    const response: HealthResponse = {
      status: 'ok',
      platform: platformInfo.platform,
      isWSL: platformInfo.isWSL,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  });

  app.use(filesRouter);
  app.use(renameRouter);
  app.use(undoRouter);
  app.use(presetsRouter);

  // --- Unified error handling middleware ---

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('[Error]', err.message);

      const errorResponse: ErrorResponse = {
        error: err.message || 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      };

      res.status(500).json(errorResponse);
    },
  );

  return app;
}

// --- Server startup ---

export async function startServer(
  app: express.Express,
  options: ServerOptions = {},
): Promise<{ port: number; server: Server }> {
  configureDataDirs(options.dataDir);

  await ensureUndoDirectory();
  await ensurePresetsDirectory();
  await recoverIncompleteJournals();

  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 3001;

  return new Promise((resolve, reject) => {
    const server = app.listen(requestedPort, host, () => {
      const addr = server.address() as AddressInfo;
      console.log(`Server running on http://${host}:${addr.port}`);
      resolve({ port: addr.port, server });
    });
    server.once('error', reject);
  });
}
