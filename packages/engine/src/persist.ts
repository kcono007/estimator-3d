/**
 * Persistence format — pure serialize/parse for the project store.
 *
 * The browser owns the storage; this module owns the SHAPE. Keeping it here means the
 * round trip is covered by the engine's own test suite instead of being trusted.
 *
 * The important job: a stored blob is untrusted input. It may have been hand-edited in
 * devtools. Anything it says about trust level is stripped on the way in — trust is
 * derived from dimension sources and from nothing else, ever.
 */

import type { Project, RoomScope } from './project';
import { isDimSource, isOpeningKind, isWallId } from './roomgraph';
import { TIERS } from './ratebook';

export const PROJECT_STORE_VERSION = 1;

export interface ProjectStore {
  version: number;
  projects: Project[];
}

export interface ParseResult {
  projects: Project[];
  /** Entries that failed validation, with the reason. Dropped loudly, never silently. */
  dropped: { index: number; reason: string }[];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Rebuilds a Space from untrusted JSON, keeping only fields the engine knows. */
function readSpace(raw: unknown, fallbackName: string): Project['rooms'][number]['space'] {
  const o = isObj(raw) ? raw : {};
  const openingsRaw = Array.isArray(o['openings']) ? o['openings'] : [];
  return {
    id: str(o['id'], 'sp-1'),
    name: str(o['name'], fallbackName),
    width_ft: numOr(o['width_ft'], NaN),
    depth_ft: numOr(o['depth_ft'], NaN),
    height_ft: numOr(o['height_ft'], NaN),
    dimensionSource: isDimSource(o['dimensionSource']) ? o['dimensionSource'] : 'manual',
    openings: openingsRaw.map((r, i) => {
      const op = isObj(r) ? r : {};
      const sill = op['sill_ft'];
      const offset = op['offset_ft'];
      return {
        id: str(op['id'], `op-${i + 1}`),
        kind: isOpeningKind(op['kind']) ? op['kind'] : 'window',
        wall: isWallId(op['wall']) ? op['wall'] : 'N',
        width_ft: numOr(op['width_ft'], NaN),
        height_ft: numOr(op['height_ft'], NaN),
        dimensionSource: isDimSource(op['dimensionSource']) ? op['dimensionSource'] : 'manual',
        ...(typeof sill === 'number' && Number.isFinite(sill) ? { sill_ft: sill } : {}),
        ...(typeof offset === 'number' && Number.isFinite(offset) ? { offset_ft: offset } : {}),
      };
    }),
  };
}

function readRoom(raw: unknown, index: number): RoomScope {
  const o = isObj(raw) ? raw : {};
  const selectionsRaw = Array.isArray(o['selections']) ? o['selections'] : [];
  return {
    id: str(o['id'], `room-${index + 1}`),
    space: readSpace(o['space'], `Room ${index + 1}`),
    selections: selectionsRaw.flatMap((s) => {
      if (!isObj(s) || typeof s['code'] !== 'string' || s['code'].trim() === '') return [];
      const override = s['qtyOverride'];
      return [
        typeof override === 'number' && Number.isFinite(override)
          ? { code: s['code'], qtyOverride: override }
          : { code: s['code'] },
      ];
    }),
  };
}

/**
 * Rebuilds a Project from untrusted JSON.
 *
 * Every field is read explicitly. Unknown keys — `trustLevel` above all — are not copied
 * across, so no amount of editing localStorage can promote an estimate's trust label.
 */
export function readProject(raw: unknown): Project {
  const o = isObj(raw) ? raw : {};
  const cfg = isObj(o['config']) ? o['config'] : {};
  const tier = cfg['tier'];
  const roomsRaw = Array.isArray(o['rooms']) ? o['rooms'] : [];

  return {
    id: str(o['id']),
    name: str(o['name'], 'Untitled Project'),
    client: str(o['client']),
    address: str(o['address']),
    createdAt: str(o['createdAt']),
    rooms: roomsRaw.map(readRoom),
    config: {
      laborRatePerHour: numOr(cfg['laborRatePerHour'], 65),
      opPct: numOr(cfg['opPct'], 0.2),
      tier: (TIERS as readonly unknown[]).includes(tier) ? (tier as Project['config']['tier']) : 'better',
      assumptions: strList(cfg['assumptions']),
      exclusions: strList(cfg['exclusions']),
    },
  };
}

export function serializeProjects(projects: readonly Project[]): string {
  const store: ProjectStore = { version: PROJECT_STORE_VERSION, projects: [...projects] };
  return JSON.stringify(store);
}

/**
 * Parses a stored blob. Never throws on garbage — a corrupt store must not brick the app —
 * but it reports everything it refused so the UI can say what was lost.
 */
export function parseProjects(raw: string | null | undefined): ParseResult {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { projects: [], dropped: [] };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { projects: [], dropped: [{ index: -1, reason: 'stored data is not valid JSON' }] };
  }

  const list = isObj(decoded) && Array.isArray(decoded['projects']) ? decoded['projects'] : null;
  if (list === null) {
    return { projects: [], dropped: [{ index: -1, reason: 'stored data has no projects array' }] };
  }

  const projects: Project[] = [];
  const dropped: { index: number; reason: string }[] = [];

  list.forEach((entry, index) => {
    const project = readProject(entry);
    if (project.id.trim() === '') {
      dropped.push({ index, reason: 'project has no id' });
      return;
    }
    projects.push(project);
  });

  return { projects, dropped };
}
