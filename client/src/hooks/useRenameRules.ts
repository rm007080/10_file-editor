import { useState, useCallback } from 'react';
import type { ReplaceRule, DelimiterRule, SequenceRule, RenameRule } from '@app/shared';

export type RuleType = RenameRule['type'];

function createDefaultRule(type: RuleType): RenameRule {
  switch (type) {
    case 'replace':
      return {
        type: 'replace',
        enabled: true,
        search: '',
        replace: '',
        useRegex: false,
        caseSensitive: false,
        includeExtension: false,
      } satisfies ReplaceRule;
    case 'delimiter':
      return {
        type: 'delimiter',
        enabled: true,
        delimiter: '_',
        position: 1,
        side: 'right',
        action: 'replace',
        value: '',
      } satisfies DelimiterRule;
    case 'sequence':
      return {
        type: 'sequence',
        enabled: true,
        start: 1,
        step: 1,
        padding: 3,
        position: 'suffix',
        sortBy: 'name',
        sortOrder: 'asc',
      } satisfies SequenceRule;
  }
}

interface UseRenameRulesReturn {
  rules: RenameRule[];
  addRule: (type: RuleType) => void;
  removeRule: (index: number) => void;
  updateRule: (index: number, rule: RenameRule) => void;
  moveRule: (index: number, direction: 'up' | 'down') => void;
  loadRules: (rules: RenameRule[]) => void;
}

export function useRenameRules(): UseRenameRulesReturn {
  const [rules, setRules] = useState<RenameRule[]>([createDefaultRule('replace')]);

  const addRule = useCallback((type: RuleType) => {
    setRules((prev) => [...prev, createDefaultRule(type)]);
  }, []);

  const removeRule = useCallback((index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateRule = useCallback((index: number, rule: RenameRule) => {
    setRules((prev) => {
      const current = prev[index];
      if (!current) return prev;
      if (JSON.stringify(current) === JSON.stringify(rule)) return prev;
      return prev.map((r, i) => (i === index ? rule : r));
    });
  }, []);

  const moveRule = useCallback((index: number, direction: 'up' | 'down') => {
    setRules((prev) => {
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const loadRules = useCallback((newRules: RenameRule[]) => {
    setRules(newRules.length > 0 ? newRules : [createDefaultRule('replace')]);
  }, []);

  return { rules, addRule, removeRule, updateRule, moveRule, loadRules };
}
