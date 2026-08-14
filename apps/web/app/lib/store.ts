'use client';

import {
  type Project,
  type Space,
  parseProjects,
  serializeProjects,
} from '@estimator3d/engine';

/**
 * The browser side of persistence: localStorage, and nothing else.
 *
 * "The simplest thing that survives a reload without a new dependency or a hosted
 * service." The SHAPE of the stored data — and the fact that a hand-edited store cannot
 * smuggle in a trust label — lives in the engine's persist.ts, where the test suite
 * covers it. This file only moves strings in and out of the browser.
 *
 * The clock and the entropy live here too. The engine never asks what time it is, so ids
 * and createdAt stamps are minted at this edge and handed in as inputs.
 */

export const STORAGE_KEY = 'estimator3d.projects.v1';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Private mode, blocked cookies, or a locked-down browser.
    return null;
  }
}

export interface LoadResult {
  projects: Project[];
  dropped: { index: number; reason: string }[];
  /** True when the browser refuses us storage — the UI must say so, not pretend. */
  unavailable: boolean;
}

export function loadProjects(): LoadResult {
  const s = storage();
  if (!s) return { projects: [], dropped: [], unavailable: true };
  const { projects, dropped } = parseProjects(s.getItem(STORAGE_KEY));
  return { projects, dropped, unavailable: false };
}

export function saveProjects(projects: readonly Project[]): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(STORAGE_KEY, serializeProjects(projects));
    return true;
  } catch {
    return false;
  }
}

/** Browser-side id. The engine takes ids as inputs; it never mints them. */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

/** Browser-side clock. Same reason. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The golden room from the approved mockup — 16 x 12 x 8, door south, windows north and
 * east. Seeded into every new project so the numbers on screen are the numbers Kevin
 * signed off on.
 */
export function goldenSpace(name: string): Space {
  return {
    id: 'sp-1',
    name,
    width_ft: 16,
    depth_ft: 12,
    height_ft: 8,
    dimensionSource: 'measured',
    openings: [
      {
        id: 'op-1',
        kind: 'door',
        wall: 'S',
        width_ft: 3,
        height_ft: 6.67,
        offset_ft: 2,
        dimensionSource: 'measured',
      },
      {
        id: 'op-2',
        kind: 'window',
        wall: 'N',
        width_ft: 4,
        height_ft: 3,
        sill_ft: 3.5,
        offset_ft: 3,
        dimensionSource: 'measured',
      },
      {
        id: 'op-3',
        kind: 'window',
        wall: 'E',
        width_ft: 4,
        height_ft: 3,
        sill_ft: 3.5,
        offset_ft: 4,
        dimensionSource: 'measured',
      },
    ],
  };
}

export const DEFAULT_ASSUMPTIONS = [
  'Subfloor is flat, dry and structurally sound.',
  'Walls are paint-ready after standard prep.',
  'Normal access; room empty of furniture at start of work.',
];

export const DEFAULT_EXCLUSIONS = [
  'Hidden conditions — plumbing, electrical, rot, mould, asbestos.',
  'Permits and inspection fees.',
  'Structural work and furniture moving.',
];

export function newProject(name: string): Project {
  return {
    id: newId('pr'),
    name,
    client: '',
    address: '',
    createdAt: todayIso(),
    rooms: [{ id: newId('room'), space: goldenSpace(name), selections: [] }],
    config: {
      laborRatePerHour: 65,
      opPct: 0.2,
      tier: 'better',
      assumptions: DEFAULT_ASSUMPTIONS,
      exclusions: DEFAULT_EXCLUSIONS,
    },
  };
}
