import { useCallback, useState } from 'react';

/** useState mirrored to localStorage under `key`. Corrupt/missing values fall
 *  back to `fallback`. Mirrors the theme-persistence pattern (no backend). */
export function usePersistentState<T>(
  key: string,
  fallback: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage unavailable (private mode / quota) — keep in-memory value
      }
    },
    [key],
  );

  return [value, set];
}
