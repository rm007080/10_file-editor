import { Router } from 'express';
import { listFiles } from '../services/fileService.js';
import { getFilesSchema } from '../utils/validation.js';
import { ValidationError } from '../utils/validation.js';
import { PathConversionError } from '../utils/pathConverter.js';
import type { ErrorResponse } from '@app/shared';

export const filesRouter = Router();

filesRouter.get('/api/files', async (req, res) => {
  try {
    // Validate query parameters
    const parsed = getFilesSchema.safeParse(req.query);
    if (!parsed.success) {
      const errorResponse: ErrorResponse = {
        error: parsed.error.errors[0].message,
        code: 'VALIDATION_ERROR',
        details: parsed.error.errors,
      };
      res.status(400).json(errorResponse);
      return;
    }

    const { directoryPath, extensions, pattern } = parsed.data;

    const result = await listFiles(directoryPath, { extensions, pattern });

    res.json({
      directoryPath: result.resolvedPath,
      files: result.files,
    });
  } catch (e) {
    if (e instanceof ValidationError) {
      const statusMap: Record<string, number> = {
        DIRECTORY_NOT_FOUND: 404,
        PERMISSION_DENIED: 403,
        PROTECTED_DIRECTORY: 403,
        INVALID_PATH: 400,
        INVALID_FILENAME: 400,
      };
      const status = statusMap[e.code] ?? 400;
      const errorResponse: ErrorResponse = {
        error: e.message,
        code: e.code,
      };
      res.status(status).json(errorResponse);
      return;
    }

    if (e instanceof PathConversionError) {
      const errorResponse: ErrorResponse = {
        error: e.message,
        code: 'INVALID_PATH',
      };
      res.status(400).json(errorResponse);
      return;
    }

    // Unexpected error — let the unified error middleware handle it
    throw e;
  }
});
