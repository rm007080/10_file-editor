import { useState, useEffect, useCallback } from 'react';
import { Modal } from '../common/Modal.js';
import {
  getPresets,
  savePreset as apiSavePreset,
  deletePreset as apiDeletePreset,
  ApiError,
} from '../../services/api.js';
import type { Preset, RenameRule } from '@app/shared';
import styles from './PresetModal.module.css';

interface PresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRules: RenameRule[];
  onLoadPreset: (rules: RenameRule[]) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

type Tab = 'load' | 'save';

export function PresetModal({
  isOpen,
  onClose,
  currentRules,
  onLoadPreset,
  onSuccess,
  onError,
}: PresetModalProps) {
  const [tab, setTab] = useState<Tab>('load');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadPresets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPresets();
      setPresets(data);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'プリセットの取得に失敗しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPresets();
      setPresetName('');
    }
  }, [isOpen, loadPresets]);

  const handleSave = async () => {
    if (!presetName.trim()) return;
    setIsSaving(true);
    try {
      await apiSavePreset(presetName.trim(), currentRules);
      onSuccess(`プリセット「${presetName.trim()}」を保存しました`);
      setPresetName('');
      await loadPresets();
      setTab('load');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'プリセットの保存に失敗しました';
      onError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = (preset: Preset) => {
    onLoadPreset(preset.rules);
    onSuccess(`プリセット「${preset.name}」を読み込みました`);
    onClose();
  };

  const handleDelete = async (e: React.MouseEvent, preset: Preset) => {
    e.stopPropagation();
    try {
      await apiDeletePreset(preset.id);
      onSuccess(`プリセット「${preset.name}」を削除しました`);
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'プリセットの削除に失敗しました';
      onError(message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="プリセット管理">
      <div className={styles.tabs}>
        <button
          className={tab === 'load' ? styles.tabActive : styles.tab}
          onClick={() => setTab('load')}
        >
          読込
        </button>
        <button
          className={tab === 'save' ? styles.tabActive : styles.tab}
          onClick={() => setTab('save')}
        >
          保存
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {tab === 'save' && (
        <div className={styles.saveForm}>
          <input
            className={styles.nameInput}
            type="text"
            placeholder="プリセット名を入力"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
          />
          <button
            className={styles.saveButton}
            onClick={handleSave}
            disabled={!presetName.trim() || isSaving}
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      )}

      {tab === 'load' && (
        <>
          {isLoading && <p className={styles.loading}>読み込み中...</p>}
          {!isLoading && presets.length === 0 && (
            <p className={styles.empty}>保存済みプリセットがありません</p>
          )}
          {!isLoading && presets.length > 0 && (
            <div className={styles.list}>
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className={styles.presetItem}
                  onClick={() => handleLoad(preset)}
                >
                  <div>
                    <div className={styles.presetName}>{preset.name}</div>
                    <div className={styles.presetMeta}>{preset.rules.length} ルール</div>
                  </div>
                  <button className={styles.deleteBtn} onClick={(e) => handleDelete(e, preset)}>
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
