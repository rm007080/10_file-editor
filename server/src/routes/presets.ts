import { Router } from 'express';
import { listPresets, savePreset, deletePreset } from '../services/presetService.js';
import { savePresetSchema } from '../utils/validation.js';
import type { ErrorResponse } from '@app/shared';

export const presetsRouter = Router();

presetsRouter.get('/api/presets', async (_req, res) => {
  try {
    const presets = await listPresets();
    res.json(presets);
  } catch {
    const errorResponse: ErrorResponse = {
      error: 'プリセット一覧の取得に失敗しました',
      code: 'INTERNAL_ERROR',
    };
    res.status(500).json(errorResponse);
  }
});

presetsRouter.post('/api/presets', async (req, res) => {
  try {
    const parsed = savePresetSchema.safeParse(req.body);
    if (!parsed.success) {
      const errorResponse: ErrorResponse = {
        error: parsed.error.errors[0].message,
        code: 'VALIDATION_ERROR',
        details: parsed.error.errors,
      };
      res.status(400).json(errorResponse);
      return;
    }

    const { name, rules, id } = parsed.data;
    const preset = await savePreset(name, rules, id);
    res.status(201).json(preset);
  } catch (e) {
    const errorResponse: ErrorResponse = {
      error: (e as Error).message || 'プリセットの保存に失敗しました',
      code: 'INTERNAL_ERROR',
    };
    res.status(500).json(errorResponse);
  }
});

presetsRouter.delete('/api/presets/:id', async (req, res) => {
  try {
    await deletePreset(req.params.id);
    res.json({ success: true });
  } catch (e) {
    const message = (e as Error).message;
    if (message === 'プリセットが見つかりません') {
      const errorResponse: ErrorResponse = {
        error: message,
        code: 'NOT_FOUND',
      };
      res.status(404).json(errorResponse);
      return;
    }
    const errorResponse: ErrorResponse = {
      error: 'プリセットの削除に失敗しました',
      code: 'INTERNAL_ERROR',
    };
    res.status(500).json(errorResponse);
  }
});
