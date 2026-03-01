import { open, rename as fsRename, readdir, unlink, mkdir, access } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rename as fsRenameFile } from 'node:fs/promises';
import type { RenameMapping } from '@app/shared';
import { validateFileName } from '../utils/validation.js';

// --- Types ---

export type JournalPhase =
  | 'pending'
  | 'temp_done'
  | 'completed'
  | 'rollback_done'
  | 'rollback_failed';

export interface UndoJournal {
  operationId: string;
  timestamp: string;
  directoryPath: string;
  phase: JournalPhase;
  mappings: RenameMapping[];
  tempMappings: { from: string; tempName: string }[];
}

export interface JournalSummary {
  operationId: string;
  timestamp: string;
  directoryPath: string;
  phase: JournalPhase;
  fileCount: number;
}

// --- Constants ---

const MAX_JOURNALS = 50;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let UNDO_DIR = path.resolve(__dirname, '../../data/undo');

// --- Directory management ---

export function getUndoDirectoryPath(): string {
  return UNDO_DIR;
}

export async function ensureUndoDirectory(): Promise<void> {
  await mkdir(UNDO_DIR, { recursive: true });
}

// --- Atomic journal I/O ---

export async function writeJournal(journal: UndoJournal): Promise<void> {
  const finalPath = path.join(UNDO_DIR, `${journal.operationId}.json`);
  const tempPath = finalPath + '.tmp';
  const json = JSON.stringify(journal, null, 2);

  const fd = await open(tempPath, 'w');
  try {
    await fd.writeFile(json, 'utf-8');
    await fd.sync();
  } finally {
    await fd.close();
  }

  await fsRename(tempPath, finalPath);
}

export async function updateJournalPhase(operationId: string, phase: JournalPhase): Promise<void> {
  const journal = await readJournal(operationId);
  if (!journal) return;

  journal.phase = phase;
  await writeJournal(journal);
}

export async function readJournal(operationId: string): Promise<UndoJournal | undefined> {
  const filePath = path.join(UNDO_DIR, `${operationId}.json`);
  try {
    await access(filePath);
  } catch {
    return undefined;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as UndoJournal;
  } catch {
    // JSON parse error or read error — corrupted journal
    return undefined;
  }
}

export async function readLatestCompletedJournal(): Promise<UndoJournal | undefined> {
  const summaries = await listJournals();
  const completed = summaries.find((s) => s.phase === 'completed');
  if (!completed) return undefined;
  return readJournal(completed.operationId);
}

// --- Listing & Rotation ---

export async function listJournals(): Promise<JournalSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(UNDO_DIR);
  } catch {
    return [];
  }

  const summaries: JournalSummary[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const operationId = entry.replace('.json', '');
    const journal = await readJournal(operationId);
    if (!journal) continue;

    summaries.push({
      operationId: journal.operationId,
      timestamp: journal.timestamp,
      directoryPath: journal.directoryPath,
      phase: journal.phase,
      fileCount: journal.mappings.length,
    });
  }

  summaries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return summaries;
}

export async function rotateJournals(): Promise<void> {
  const summaries = await listJournals();
  if (summaries.length <= MAX_JOURNALS) return;

  const toDelete = summaries.slice(MAX_JOURNALS);
  for (const s of toDelete) {
    const filePath = path.join(UNDO_DIR, `${s.operationId}.json`);
    try {
      await unlink(filePath);
    } catch {
      // Ignore deletion errors
    }
  }
}

// --- Quarantine ---

const quarantinedDirs = new Set<string>();

export function isQuarantined(canonicalPath: string): boolean {
  return quarantinedDirs.has(canonicalPath.toLowerCase());
}

export function quarantineDirectory(canonicalPath: string): void {
  quarantinedDirs.add(canonicalPath.toLowerCase());
  console.error(`[Quarantine] Directory quarantined: ${canonicalPath}. Manual recovery required.`);
}

// --- Rollback ---

export async function performRollback(
  directoryPath: string,
  mappings: RenameMapping[],
  tempMappings: { from: string; tempName: string }[],
  operationId: string,
  phase: 'pending' | 'temp_done',
): Promise<void> {
  let allSucceeded = true;

  for (let i = 0; i < tempMappings.length; i++) {
    const tm = tempMappings[i];
    const originalPath = path.join(directoryPath, tm.from);
    const tempPath = path.join(directoryPath, tm.tempName);
    const finalPath = path.join(directoryPath, mappings[i].to);

    try {
      if (phase === 'pending') {
        // During Step 1: file is at tempPath (succeeded) or originalPath (not yet renamed)
        try {
          await access(tempPath);
          await fsRenameFile(tempPath, originalPath);
        } catch {
          // temp doesn't exist — original is still in place
        }
      } else {
        // phase === 'temp_done': Step 2 was in progress
        // File could be at finalPath (succeeded) or tempPath (not yet renamed)
        try {
          await access(finalPath);
          await fsRenameFile(finalPath, originalPath);
        } catch {
          try {
            await access(tempPath);
            await fsRenameFile(tempPath, originalPath);
          } catch {
            allSucceeded = false;
          }
        }
      }
    } catch {
      allSucceeded = false;
    }
  }

  if (allSucceeded) {
    await updateJournalPhase(operationId, 'rollback_done');
  } else {
    await updateJournalPhase(operationId, 'rollback_failed');
    quarantineDirectory(directoryPath);
  }
}

// --- Startup recovery ---

export async function findIncompleteJournals(): Promise<UndoJournal[]> {
  const summaries = await listJournals();
  const incomplete = summaries.filter((s) => s.phase === 'pending' || s.phase === 'temp_done');

  const journals: UndoJournal[] = [];
  for (const s of incomplete) {
    const journal = await readJournal(s.operationId);
    if (journal) journals.push(journal);
  }

  return journals;
}

export async function recoverIncompleteJournals(): Promise<void> {
  const incompleteJournals = await findIncompleteJournals();

  for (const journal of incompleteJournals) {
    console.log(`[Recovery] Incomplete journal: ${journal.operationId} (phase: ${journal.phase})`);

    // Validate all file names in journal
    try {
      for (const m of journal.mappings) {
        validateFileName(m.from);
        validateFileName(m.to);
      }
    } catch {
      console.error(
        `[Recovery] Journal ${journal.operationId} has invalid file names. Quarantining: ${journal.directoryPath}`,
      );
      quarantineDirectory(journal.directoryPath);
      await updateJournalPhase(journal.operationId, 'rollback_failed');
      continue;
    }

    // Attempt rollback
    await performRollback(
      journal.directoryPath,
      journal.mappings,
      journal.tempMappings,
      journal.operationId,
      journal.phase as 'pending' | 'temp_done',
    );

    console.log(`[Recovery] Journal ${journal.operationId} recovery complete.`);
  }
}

// --- Test helpers ---

export function _setUndoDirectoryForTest(dir: string): void {
  UNDO_DIR = dir;
}

export function _resetQuarantineForTest(): void {
  quarantinedDirs.clear();
}
