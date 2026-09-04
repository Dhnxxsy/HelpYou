import { describe, it, expect } from 'vitest';
import { sanitizeFolderName, sanitizeRules, matchRules } from '../server/organizer/rules.js';
import type { ScanFile, SortRule } from '../shared/types.js';

function makeFile(path: string, name: string): ScanFile {
  return { path, name, ext: '.txt', size: 100, category: 'document', sizeBand: 'tiny', modifiedAt: 0 };
}

describe('sanitizeFolderName', () => {
  it('strips illegal characters and trims', () => {
    expect(sanitizeFolderName(' Proyek: A/B | C?* ')).toBe('Proyek AB C');
  });
  it('collapses whitespace and caps length at 40 chars', () => {
    const long = ' a b c d e f g h i j k l m n o p q r s t u v w x y z 1 2 3 4 5 6 7 8 9 0 ';
    const out = sanitizeFolderName(long)!;
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out).toMatch(/^a b c d e f/);
  });
  it('rejects reserved names and empties', () => {
    expect(sanitizeFolderName('.')).toBeNull();
    expect(sanitizeFolderName('..')).toBeNull();
    expect(sanitizeFolderName('_TerSortir')).toBeNull();
    expect(sanitizeFolderName('  ')).toBeNull();
    expect(sanitizeFolderName('')).toBeNull();
    expect(sanitizeFolderName('::')).toBeNull();
  });
});

describe('sanitizeRules', () => {
  it('drops invalid rules and normalizes the rest', () => {
    const out = sanitizeRules([
      { id: 'r1', action: 'sort', matchOn: 'name', operation: 'contains', value: 'x', folder: 'Proyek A', enabled: true },
      null,
      { id: 'r2', action: 'skip', operation: 'contains', value: '' },            // empty value
      { id: 'r3', action: 'sort', operation: 'regex', value: '(' },              // bad regex
      { id: 'r4', action: 'skip', operation: 'regex', value: '\\.tmp$' },        // good
      { id: 'r5', action: 'sort', operation: 'contains', value: 'db', folder: '..' }, // bad folder
    ]);
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({ id: 'r1', action: 'sort', folder: 'Proyek A', matchOn: 'name', operation: 'contains' });
    expect(out[1]).toMatchObject({ id: 'r4', action: 'skip', operation: 'regex' });
  });
});

describe('matchRules', () => {
  const rules: SortRule[] = [
    { id: 'a', action: 'sort', matchOn: 'name', operation: 'contains', value: 'draft', folder: 'Draft', enabled: true },
    { id: 'b', action: 'skip', matchOn: 'name', operation: 'ends', value: '.tmp', enabled: true },
    { id: 'c', action: 'sort', matchOn: 'path', operation: 'contains', value: 'archive', folder: 'Arsip-Dulu', enabled: true },
    { id: 'd', action: 'sort', matchOn: 'name', operation: 'regex', value: '^IMG_\\d+\\.', folder: 'Foto-RAW', enabled: true },
  ];

  it('first match wins; skip has no folder; case-insensitive contains', () => {
    const files = [
      makeFile('/draft-a.txt', 'DRAFT-A.txt'),
      makeFile('/note.tmp', 'note.tmp'),
      makeFile('/old/archive/b.txt', 'b.txt'),
      makeFile('/IMG_1234.jpg', 'IMG_1234.jpg'),
      makeFile('/normal.txt', 'normal.txt'),
    ];
    const m = matchRules(files, rules);
    expect(m.get('/draft-a.txt')).toEqual({ ruleId: 'a', folder: 'Draft' });
    expect(m.get('/note.tmp')).toEqual({ ruleId: 'b' }); // skip (no folder)
    expect(m.get('/old/archive/b.txt')).toEqual({ ruleId: 'c', folder: 'Arsip-Dulu' });
    expect(m.get('/IMG_1234.jpg')).toEqual({ ruleId: 'd', folder: 'Foto-RAW' });
    expect(m.has('/normal.txt')).toBe(false);
  });

  it('ignores disabled rules', () => {
    const disabled: SortRule[] = [{ ...rules[0], enabled: false }];
    const m = matchRules([makeFile('/draft-a.txt', 'draft-a.txt')], disabled);
    expect(m.size).toBe(0);
  });
});