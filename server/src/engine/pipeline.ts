import path from 'node:path';
import type { FileEntry, RenameRule } from '@app/shared';
import type { PreviewResult } from '@app/shared';
import type {
  RuleProcessor,
  BatchRuleProcessor,
  RenameContext,
  BatchEntry,
  BatchResult,
} from './types.js';
import { ReplaceProcessor } from './rules/replaceRule.js';
import { DelimiterProcessor } from './rules/delimiterRule.js';
import { SequenceProcessor } from './rules/sequenceRule.js';

// --- Pipeline entry ---

interface PipelineEntry {
  id: number;
  fileName: string;
  context: RenameContext;
  fileEntry: FileEntry;
}

export function applyRuleChain(files: FileEntry[], rules: RenameRule[]): PreviewResult[] {
  // Build initial entries
  let entries: PipelineEntry[] = files.map((file, index) => {
    const ext = path.extname(file.name);
    const base = path.basename(file.name, ext);
    return {
      id: index,
      fileName: file.name,
      fileEntry: file,
      context: {
        index,
        totalCount: files.length,
        originalName: file.name,
        originalBaseName: base,
        originalExtension: ext,
        currentBaseName: base,
        currentExtension: ext,
      },
    };
  });

  // Apply each enabled rule sequentially
  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (isBatchRule(rule)) {
      const processor = createBatchProcessor(rule);
      const batchEntries: BatchEntry[] = entries.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        context: e.context,
        fileEntry: e.fileEntry,
      }));
      const results = processor.applyBatch(batchEntries);
      entries = remapByIds(entries, results);
    } else {
      const processor = createProcessor(rule);
      for (const entry of entries) {
        entry.fileName = processor.apply(entry.fileName, entry.context);
      }
    }

    // Recalculate currentBaseName / currentExtension after each rule
    for (const entry of entries) {
      const ext = path.extname(entry.fileName);
      entry.context.currentBaseName = path.basename(entry.fileName, ext);
      entry.context.currentExtension = ext;
    }
  }

  // Build results
  return entries.map((entry) => ({
    originalName: files[entry.id].name,
    newName: entry.fileName,
    hasChanged: files[entry.id].name !== entry.fileName,
    hasCollision: false,
  }));
}

// --- Rule type discrimination ---

function isBatchRule(rule: RenameRule): boolean {
  return rule.type === 'sequence';
}

// --- Factory functions ---

function createProcessor(rule: RenameRule): RuleProcessor {
  switch (rule.type) {
    case 'replace':
      return new ReplaceProcessor(rule);
    case 'delimiter':
      return new DelimiterProcessor(rule);
    default:
      throw new Error(`Unknown per-file rule type: ${(rule as { type: string }).type}`);
  }
}

function createBatchProcessor(rule: RenameRule): BatchRuleProcessor {
  switch (rule.type) {
    case 'sequence':
      return new SequenceProcessor(rule);
    default:
      throw new Error(`Unknown batch rule type: ${(rule as { type: string }).type}`);
  }
}

// --- ID-based remapping ---

function remapByIds(entries: PipelineEntry[], results: BatchResult[]): PipelineEntry[] {
  const resultMap = new Map<number, string>();
  for (const r of results) {
    resultMap.set(r.id, r.fileName);
  }

  for (const entry of entries) {
    const newName = resultMap.get(entry.id);
    if (newName !== undefined) {
      entry.fileName = newName;
    }
  }

  return entries;
}
