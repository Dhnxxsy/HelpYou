import { useCallback, useEffect, useState } from 'react';

export function useDrives() {
  const [drives, setDrives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/drives')
      .then(r => {
        if (!r.ok) throw new Error('Gagal membaca daftar drive');
        return r.json();
      })
      .then(d => setDrives(d.drives || []))
      .catch(() => setError('Server tidak memberi respons saat membaca daftar drive.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { drives, loading, error, reload: load };
}