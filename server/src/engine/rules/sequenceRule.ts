import type { SequenceRule } from '@app/shared';
import type { BatchRuleProcessor, BatchEntry, BatchResult } from '../types.js';

export class SequenceProcessor implements BatchRuleProcessor {
  private readonly start: number;
  private readonly step: number;
  private readonly padding: number;
  private readonly position: 'prefix' | 'suffix' | 'custom';
  private readonly customPosition: number;
  private readonly template: string | undefined;
  private readonly sortBy: 'name' | 'date' | 'size';
  private readonly sortOrder: 'asc' | 'desc';

  constructor(rule: SequenceRule) {
    this.start = rule.start;
    this.step = rule.step;
    this.padding = rule.padding;
    this.position = rule.position;
    this.customPosition = rule.customPosition ?? 0;
    this.template = rule.template;
    this.sortBy = rule.sortBy;
    this.sortOrder = rule.sortOrder;
  }

  applyBatch(entries: BatchEntry[]): BatchResult[] {
    // Sort entries by the specified criteria
    const sorted = [...entries].sort((a, b) => {
      let cmp = 0;
      switch (this.sortBy) {
        case 'name':
          cmp = a.fileName.localeCompare(b.fileName);
          break;
        case 'date':
          cmp =
            new Date(a.fileEntry.modifiedAt).getTime() - new Date(b.fileEntry.modifiedAt).getTime();
          break;
        case 'size':
          cmp = a.fileEntry.size - b.fileEntry.size;
          break;
      }
      return this.sortOrder === 'desc' ? -cmp : cmp;
    });

    // Assign sequential numbers based on sort order
    const results: BatchResult[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const num = this.start + i * this.step;
      const numStr = String(num).padStart(this.padding, '0');

      const ext = entry.context.currentExtension;
      const baseName = entry.context.currentBaseName;

      let newFileName: string;

      if (this.template) {
        newFileName = this.applyTemplate(this.template, baseName, numStr, ext);
      } else {
        newFileName = this.applyPosition(baseName, numStr, ext);
      }

      results.push({ id: entry.id, fileName: newFileName });
    }

    return results;
  }

  private applyTemplate(template: string, baseName: string, numStr: string, ext: string): string {
    // Replace template tokens: {name}, {num}, {num:N}, {ext}
    let result = template;

    result = result.replace(/\{name\}/g, baseName);
    result = result.replace(/\{ext\}/g, ext.startsWith('.') ? ext.slice(1) : ext);

    // {num:N} — N-digit zero-padded number
    result = result.replace(/\{num:(\d+)\}/g, (_match, digits) => {
      const width = parseInt(digits, 10);
      const rawNum = parseInt(numStr, 10);
      return String(rawNum).padStart(width, '0');
    });

    // {num} — use the default padding
    result = result.replace(/\{num\}/g, numStr);

    return result;
  }

  private applyPosition(baseName: string, numStr: string, ext: string): string {
    switch (this.position) {
      case 'prefix':
        return numStr + '_' + baseName + ext;
      case 'suffix':
        return baseName + '_' + numStr + ext;
      case 'custom': {
        const pos = Math.max(0, Math.min(this.customPosition, baseName.length));
        const before = baseName.slice(0, pos);
        const after = baseName.slice(pos);
        return before + numStr + after + ext;
      }
    }
  }
}
