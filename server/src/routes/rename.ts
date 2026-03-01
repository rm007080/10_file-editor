import { Router } from 'express';
import { preview, execute } from '../services/renameService.js';
import { previewSchema, renameSchema, ValidationError } from '../utils/validation.js';
import { PathConversionError } from '../utils/pathConverter.js';
import type { ErrorResponse, PreviewResponse, RenameResponse } from '@app/shared';

export const renameRouter = Router();

renameRouter.post('/api/preview', async (req, res) => {
  try {
    // Validate request body
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) {
      const errorResponse: ErrorResponse = {
        error: parsed.error.errors[0].message,
        code: 'VALIDATION_ERROR',
        details: parsed.error.errors,
      };
      res.status(400).json(errorResponse);
      return;
    }

    const { directoryPath, rules, selectedFiles } = parsed.data;

    const result = await preview(directoryPath, rules, selectedFiles);

    const response: PreviewResponse = {
      previewToken: result.previewToken,
      results: result.results,
      hasCollisions: result.hasCollisions,
    };

    res.json(response);
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

renameRouter.post('/api/rename', async (req, res) => {
  try {
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) {
      const errorResponse: ErrorResponse = {
        error: parsed.error.errors[0].message,
        code: 'VALIDATION_ERROR',
        details: parsed.error.errors,
      };
      res.status(400).json(errorResponse);
      return;
    }

    const { previewToken } = parsed.data;

    const result = await execute(previewToken);

    const response: RenameResponse = {
      operationId: result.operationId,
      successCount: result.successCount,
      failureCount: result.failureCount,
      failures: result.failures,
    };

    res.json(response);
  } catch (e) {
    if (e instanceof ValidationError) {
      const statusMap: Record<string, number> = {
        INVALID_PREVIEW_TOKEN: 400,
        COLLISION_DETECTED: 409,
        RENAME_FAILED: 500,
        DIRECTORY_QUARANTINED: 403,
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

    throw e;
  }
});
