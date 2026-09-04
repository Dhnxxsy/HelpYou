import { describe, it, expect } from 'vitest';
import { categoryForExtension, sizeBandForSize, formatBytes, CATEGORY_ICONS, categoryLabel } from '../server/organizer/categories.js';
import type { FileCategory } from '../shared/types.js';

describe('categoryForExtension', () => {
  it('classifies common types', () => {
    expect(categoryForExtension('mp4')).toBe('video');
    expect(categoryForExtension('jpg')).toBe('image');
    expect(categoryForExtension('mp3')).toBe('audio');
    expect(categoryForExtension('pdf')).toBe('document');
    expect(categoryForExtension('zip')).toBe('archive');
    expect(categoryForExtension('exe')).toBe('program');
    expect(categoryForExtension('ts')).toBe('code');
  });

  it('is case-insensitive and handles leading dot', () => {
    expect(categoryForExtension('.MP4')).toBe('video');
    expect(categoryForExtension('.Png')).toBe('image');
  });

  it('falls back to other for unknown', () => {
    expect(categoryForExtension('xyzabc')).toBe('other');
    expect(categoryForExtension('')).toBe('other');
  });

  it('has label and icon for every category', () => {
    const cats: FileCategory[] = ['video', 'image', 'audio', 'document', 'archive', 'program', 'code', 'design', 'ebook', 'font', 'data', 'virtual', 'disc-image', 'torrent', 'other'];
    for (const c of cats) {
      expect(categoryLabel(c).length).toBeGreaterThan(0);
      expect(CATEGORY_ICONS[c].length).toBeGreaterThan(0);
    }
  });
});

describe('sizeBandForSize', () => {
  it('bands by size thresholds', () => {
    expect(sizeBandForSize(0)).toBe('tiny');
    expect(sizeBandForSize(50 * 1024)).toBe('tiny');
    expect(sizeBandForSize(500 * 1024)).toBe('small');
    expect(sizeBandForSize(5 * 1024 * 1024)).toBe('medium');
    expect(sizeBandForSize(50 * 1024 * 1024)).toBe('large');
    expect(sizeBandForSize(200 * 1024 * 1024)).toBe('huge');
  });
});

describe('formatBytes', () => {
  it('formats units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toContain('B');
    expect(formatBytes(2 * 1024)).toContain('KB');
    expect(formatBytes(3 * 1024 * 1024)).toContain('MB');
    expect(formatBytes(4 * 1024 ** 3)).toContain('GB');
  });
});
