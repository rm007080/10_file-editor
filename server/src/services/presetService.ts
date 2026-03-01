import { open, rename as fsRename, readdir, readFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import type { Preset, RenameRule } from '@app/shared';

// --- Constants ---

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let PRESETS_DIR = path.resolve(__dirname, '../../data/presets');

export function setPresetsDirectory(dir: string): void {
  PRESETS_DIR = dir;
}

// --- Directory management ---

export async function ensurePresetsDirectory(): Promise<void> {
  await mkdir(PRESETS_DIR, { recursive: true });
}

// --- CRUD ---

export async function listPresets(): Promise<Preset[]> {
  await ensurePresetsDirectory();

  const files = await readdir(PRESETS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'));

  const presets: Preset[] = [];
  for (const file of jsonFiles) {
    try {
      const content = await readFile(path.join(PRESETS_DIR, file), 'utf-8');
      const parsed = JSON.parse(content) as Preset;
      presets.push(parsed);
    } catch {
      // Skip unparseable files
    }
  }

  // Sort by name
  presets.sort((a, b) => a.name.localeCompare(b.name));
  return presets;
}

export async function savePreset(name: string, rules: RenameRule[], id?: string): Promise<Preset> {
  await ensurePresetsDirectory();

  const preset: Preset = {
    id: id ?? crypto.randomUUID(),
    name,
    rules,
  };

  const finalPath = path.join(PRESETS_DIR, `${preset.id}.json`);
  const tempPath = finalPath + '.tmp';
  const json = JSON.stringify(preset, null, 2);

  // Atomic write: temp → fsync → rename
  const fd = await open(tempPath, 'w');
  try {
    await fd.writeFile(json, 'utf-8');
    await fd.sync();
  } finally {
    await fd.close();
  }
  await fsRename(tempPath, finalPath);

  return preset;
}

export async function deletePreset(id: string): Promise<void> {
  const filePath = path.join(PRESETS_DIR, `${id}.json`);
  try {
    await unlink(filePath);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new Error('プリセットが見つかりません', { cause: e });
    }
    throw e;
  }
}
