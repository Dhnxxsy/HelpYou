type Cell = string | number;

function esc(v: Cell): string {
  const s = String(v);
  if (/[;",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function downloadCSV(filename: string, header: Cell[], rows: Cell[][]) {
  const lines = [header, ...rows].map(r => r.map(esc).join(';'));
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}