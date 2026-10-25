import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../services/api';

/** Loads async data; `reload` refetches (quietly, without flashing the loading state). */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const run = useCallback(async (quiet: boolean) => {
    if (!quiet) setLoading(true);
    try {
      const result = await loadRef.current();
      if (alive.current) { setData(result); setError(null); }
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(false); }, deps);
  const reload = useCallback(() => run(true), [run]);
  return { data, loading, error, reload };
}
