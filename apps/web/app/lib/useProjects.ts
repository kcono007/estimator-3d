'use client';

import { useCallback, useEffect, useState } from 'react';

import type { Project } from '@estimator3d/engine';

import { type LoadResult, loadProjects, saveProjects } from './store';

/**
 * Reads the store once on mount and writes through on every change.
 *
 * localStorage does not exist during server rendering, so `ready` stays false until the
 * browser has spoken. Screens must render a loading state rather than guessing — an
 * estimate rendered from assumed-empty state would be a lie for one frame.
 */
export function useProjects() {
  const [state, setState] = useState<LoadResult>({
    projects: [],
    dropped: [],
    unavailable: false,
  });
  const [ready, setReady] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);

  useEffect(() => {
    setState(loadProjects());
    setReady(true);
  }, []);

  const commit = useCallback((next: Project[]) => {
    setState((prev) => ({ ...prev, projects: next }));
    setWriteFailed(!saveProjects(next));
  }, []);

  const upsert = useCallback(
    (project: Project) => {
      setState((prev) => {
        const exists = prev.projects.some((p) => p.id === project.id);
        const next = exists
          ? prev.projects.map((p) => (p.id === project.id ? project : p))
          : [project, ...prev.projects];
        setWriteFailed(!saveProjects(next));
        return { ...prev, projects: next };
      });
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setState((prev) => {
      const next = prev.projects.filter((p) => p.id !== id);
      setWriteFailed(!saveProjects(next));
      return { ...prev, projects: next };
    });
  }, []);

  return {
    ...state,
    ready,
    writeFailed,
    commit,
    upsert,
    remove,
  };
}

/** Single project by id. `notFound` is only meaningful once `ready` is true. */
export function useProject(id: string) {
  const store = useProjects();
  const project = store.projects.find((p) => p.id === id) ?? null;
  return { ...store, project, notFound: store.ready && project === null };
}
