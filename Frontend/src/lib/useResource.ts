"use client";

/**
 * Load data on mount, with loading, error and reload.
 *
 * Every page needed this and each had its own copy. State is only set inside
 * promise callbacks, so the mount effect never re-renders synchronously.
 *
 * `fetcher` must be stable - a module-level function or a useCallback - or it
 * refetches on every render.
 */

import { useCallback, useEffect, useState } from "react";

export type Resource<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

export function useResource<T>(fetcher: () => Promise<T>): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(
    () =>
      fetcher()
        .then((value) => {
          setData(value);
          setError(null);
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Request failed."))
        .finally(() => setLoading(false)),
    [fetcher],
  );

  useEffect(() => {
    void run();
  }, [run]);

  const reload = useCallback(() => {
    setLoading(true);
    void run();
  }, [run]);

  return { data, error, loading, reload };
}
