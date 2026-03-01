import type { DelimiterRule } from '@app/shared';
import type { RuleProcessor, RenameContext } from '../types.js';

export class DelimiterProcessor implements RuleProcessor {
  private readonly delimiter: string;
  private readonly position: number;
  private readonly side: 'left' | 'right';
  private readonly action: 'replace' | 'remove' | 'keep';
  private readonly value: string;

  constructor(rule: DelimiterRule) {
    this.delimiter = rule.delimiter;
    this.position = rule.position;
    this.side = rule.side;
    this.action = rule.action;
    this.value = rule.value ?? '';
  }

  apply(_fileName: string, context: RenameContext): string {
    const baseName = context.currentBaseName;
    const ext = context.currentExtension;

    if (this.delimiter === '') {
      return baseName + ext;
    }

    const parts = baseName.split(this.delimiter);

    // If the delimiter is not found or position exceeds available delimiters,
    // return unchanged
    if (parts.length <= 1 || this.position < 1 || this.position >= parts.length) {
      return baseName + ext;
    }

    // Split index: the N-th delimiter separates parts[N-1] and parts[N]
    const splitIdx = this.position;
    const leftParts = parts.slice(0, splitIdx);
    const rightParts = parts.slice(splitIdx);

    const leftStr = leftParts.join(this.delimiter);
    const rightStr = rightParts.join(this.delimiter);

    let newBaseName: string;

    if (this.side === 'right') {
      switch (this.action) {
        case 'replace':
          newBaseName = leftStr + this.delimiter + this.value;
          break;
        case 'remove':
          newBaseName = leftStr;
          break;
        case 'keep':
          newBaseName = rightStr;
          break;
      }
    } else {
      // side === 'left'
      switch (this.action) {
        case 'replace':
          newBaseName = this.value + this.delimiter + rightStr;
          break;
        case 'remove':
          newBaseName = rightStr;
          break;
        case 'keep':
          newBaseName = leftStr;
          break;
      }
    }

    return newBaseName + ext;
  }
}
