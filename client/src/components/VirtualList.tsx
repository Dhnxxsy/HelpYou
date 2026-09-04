import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Dependency-free windowed (virtual) list.
 * Only fixed-height rows are supported. The scroll container fills its parent
 * (give the parent a definite height, e.g. `style={{ height: 416 }}`).
 */
export default function VirtualList<T>({
  items,
  rowHeight = 38,
  overscan = 10,
  rowKey,
  renderRow,
}: {
  items: T[];
  rowHeight?: number;
  overscan?: number;
  rowKey: (item: T, index: number) => string;
  renderRow: (item: T, index: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setHeight(el.clientHeight);
  };

  useLayoutEffect(() => { measure(); }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      setScrollTop(el.scrollTop);
      setHeight(el.clientHeight);
    });
  };

  const total = items.length;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(height / rowHeight);
  const end = Math.min(total, start + visible + overscan * 2);

  return (
    <div ref={ref} onScroll={onScroll} className="relative overflow-y-auto h-full">
      <div style={{ height: total * rowHeight, position: 'relative' }}>
        {items.slice(start, end).map((item, i) => {
          const idx = start + i;
          return (
            <div
              key={rowKey(item, idx)}
              style={{ position: 'absolute', top: idx * rowHeight, left: 0, right: 0, height: rowHeight }}
            >
              {renderRow(item, idx)}
            </div>
          );
        })}
      </div>
      {total === 0 && (
        <div className="py-10 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
          <span>Daftar kosong.</span>
        </div>
      )}
    </div>
  );
}