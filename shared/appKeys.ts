/**
 * Stable key shared by client & server for curated shelves (e.g. the game panel).
 * Mirrors the display key the client builds to identify a catalog entry.
 */
export function appKeyOf(input: { source?: string; name?: string; exe?: string; cwd?: string }): string {
  const exe = input?.exe && /^[a-zA-Z]:[\\/]/.test(String(input.exe)) ? String(input.exe) : '';
  return `${input?.source ?? ''}:${input?.name ?? ''}:${exe || input?.cwd || ''}`;
}