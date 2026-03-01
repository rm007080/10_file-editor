import type { ReplaceRule } from '@app/shared';
import type { RuleProcessor, RenameContext } from '../types.js';

export class ReplaceProcessor implements RuleProcessor {
  private readonly search: string;
  private readonly replacement: string;
  private readonly includeExtension: boolean;
  private readonly useRegex: boolean;
  private readonly caseSensitive: boolean;

  constructor(rule: ReplaceRule) {
    this.search = rule.search;
    this.replacement = rule.replace;
    this.includeExtension = rule.includeExtension;
    this.useRegex = rule.useRegex;
    this.caseSensitive = rule.caseSensitive;
  }

  apply(_fileName: string, context: RenameContext): string {
    if (this.search === '') {
      return context.currentBaseName + context.currentExtension;
    }

    if (this.includeExtension) {
      const fullName = context.currentBaseName + context.currentExtension;
      return this.doReplace(fullName);
    } else {
      const replaced = this.doReplace(context.currentBaseName);
      return replaced + context.currentExtension;
    }
  }

  private doReplace(input: string): string {
    if (this.useRegex) {
      const flags = 'g' + (this.caseSensitive ? '' : 'i');
      const regex = new RegExp(this.search, flags);
      return input.replace(regex, this.replacement);
    }

    if (!this.caseSensitive) {
      // Case-insensitive literal replace: use RegExp with escaped search
      const escaped = this.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      return input.replace(regex, this.replacement);
    }

    return input.replaceAll(this.search, this.replacement);
  }
}
