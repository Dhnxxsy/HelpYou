import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  parseVersionTag,
  githubFromRepoField,
  resolveUpdateSource,
} from '../electron/update-utils.cjs';

describe('parseVersionTag', () => {
  it('mengenal tag biasa dan dengan prefiks v', () => {
    expect(parseVersionTag('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersionTag('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersionTag('2.0')).toEqual([2, 0]);
  });

  it('mengabaikan sufiks pre-release', () => {
    expect(parseVersionTag('1.2.3-beta.1')).toEqual([1, 2, 3]);
    expect(parseVersionTag('v2.0.0-rc2')).toEqual([2, 0, 0]);
  });

  it('mengembalikan null untuk input invalid', () => {
    expect(parseVersionTag('')).toBeNull();
    expect(parseVersionTag(undefined)).toBeNull();
    expect(parseVersionTag('release')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('membandingkan mayor/minor/patch', () => {
    expect(compareVersions('v1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', 'v1.0.1')).toBe(-1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('menangani jumlah segmen berbeda', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
  });

  it('menangani input tidak valid', () => {
    expect(compareVersions('', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', 'x')).toBe(1);
    expect(compareVersions('abc', 'def')).toBe(0);
  });
});

describe('githubFromRepoField', () => {
  it('mengurai string owner/repo', () => {
    expect(githubFromRepoField('budi/FileOrganizer')).toEqual({ owner: 'budi', repo: 'FileOrganizer' });
  });

  it('mengurai URL git github', () => {
    expect(githubFromRepoField('https://github.com/budi/FileOrganizer.git')).toEqual({
      owner: 'budi',
      repo: 'FileOrganizer',
    });
    expect(githubFromRepoField('github:git@github.com:budi/FileOrganizer.git')).toEqual({
      owner: 'budi',
      repo: 'FileOrganizer',
    });
  });

  it('mengurai objek repository.url', () => {
    expect(
      githubFromRepoField({ url: 'git+https://github.com/budi/FileOrganizer.git' })
    ).toEqual({ owner: 'budi', repo: 'FileOrganizer' });
  });
});

describe('resolveUpdateSource', () => {
  it('membaca dari config', () => {
    const src = resolveUpdateSource({
      config: { owner: 'budi', repo: 'FileOrganizer', checkIntervalHours: 6 },
    });
    expect(src).toEqual({ owner: 'budi', repo: 'FileOrganizer', intervalHours: 6 });
  });

  it('mengutamakan env di atas config', () => {
    const src = resolveUpdateSource({
      env: { FO_UPDATE_OWNER: 'envUser', FO_UPDATE_REPO: 'envRepo', FO_UPDATE_INTERVAL_HOURS: '2' },
      config: { owner: 'budi', repo: 'FileOrganizer', checkIntervalHours: 6 },
    });
    expect(src).toEqual({ owner: 'envUser', repo: 'envRepo', intervalHours: 2 });
  });

  it('fallback ke package.json repository saat config kosong', () => {
    const src = resolveUpdateSource({ packageJson: { repository: 'budi/FileOrganizer' } });
    expect(src.owner).toBe('budi');
    expect(src.repo).toBe('FileOrganizer');
    expect(src.intervalHours).toBe(12);
  });

  it('tetap kosong jika tidak ada sumber', () => {
    const src = resolveUpdateSource({});
    expect(src.owner).toBe('');
    expect(src.repo).toBe('');
  });
});