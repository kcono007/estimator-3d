/**
 * Takeoff — quantities from geometry. Deterministic formulas, no rounding.
 *
 * Rounding is a DISPLAY decision and happens at the edge. The engine keeps full
 * precision so that money computed downstream rounds exactly once.
 */

import {
  type Opening,
  type OpeningKind,
  type Space,
  type WallId,
  WALL_IDS,
  wallLengthFt,
} from './roomgraph';

export type GeometryErrorCode =
  | 'NON_POSITIVE_DIMENSION'
  | 'NON_FINITE_DIMENSION'
  | 'OPENING_WIDER_THAN_WALL'
  | 'OPENING_TALLER_THAN_WALL'
  | 'OPENING_ABOVE_CEILING'
  | 'OPENINGS_EXCEED_WALL_LENGTH'
  | 'OPENINGS_OVERLAP'
  | 'OPENING_OFF_WALL'
  | 'DUPLICATE_OPENING_ID';

/** Typed refusal. The engine never guesses its way past bad geometry. */
export class GeometryError extends Error {
  readonly code: GeometryErrorCode;
  /** Ids of the offending opening(s), when the fault is an opening's. */
  readonly openingIds: string[];

  constructor(code: GeometryErrorCode, message: string, openingIds: string[] = []) {
    super(message);
    this.name = 'GeometryError';
    this.code = code;
    this.openingIds = openingIds;
  }
}

export interface OpeningCounts {
  door: number;
  window: number;
  opening: number;
}

export interface Takeoff {
  floorAreaSF: number;
  ceilingAreaSF: number;
  grossWallAreaSF: number;
  /** Gross wall minus the area of every opening. */
  netWallAreaSF: number;
  openingAreaSF: number;
  /** Wall perimeter minus door widths — baseboard does not cross a doorway. */
  perimeterLF: number;
  grossPerimeterLF: number;
  countsByKind: OpeningCounts;
}

function requirePositive(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new GeometryError('NON_FINITE_DIMENSION', `${label} must be a finite number, got ${value}`);
  }
  if (value <= 0) {
    throw new GeometryError('NON_POSITIVE_DIMENSION', `${label} must be > 0, got ${value}`);
  }
}

function requireNonNegative(label: string, value: number, id: string): void {
  if (!Number.isFinite(value)) {
    throw new GeometryError('NON_FINITE_DIMENSION', `${label} must be a finite number, got ${value}`, [id]);
  }
  if (value < 0) {
    throw new GeometryError('NON_POSITIVE_DIMENSION', `${label} must be >= 0, got ${value}`, [id]);
  }
}

/**
 * Throws GeometryError on anything impossible. Call it before trusting a Space;
 * `takeoff()` calls it for you.
 */
export function validateSpace(space: Space): void {
  requirePositive(`space "${space.id}" width_ft`, space.width_ft);
  requirePositive(`space "${space.id}" depth_ft`, space.depth_ft);
  requirePositive(`space "${space.id}" height_ft`, space.height_ft);

  const seen = new Set<string>();
  for (const o of space.openings) {
    if (seen.has(o.id)) {
      throw new GeometryError('DUPLICATE_OPENING_ID', `duplicate opening id "${o.id}"`, [o.id]);
    }
    seen.add(o.id);

    requirePositive(`opening "${o.id}" width_ft`, o.width_ft);
    requirePositive(`opening "${o.id}" height_ft`, o.height_ft);

    const wallLen = wallLengthFt(space, o.wall);
    if (o.width_ft > wallLen) {
      throw new GeometryError(
        'OPENING_WIDER_THAN_WALL',
        `opening "${o.id}" is ${o.width_ft} ft wide on wall ${o.wall}, which is only ${wallLen} ft long`,
        [o.id],
      );
    }
    if (o.height_ft > space.height_ft) {
      throw new GeometryError(
        'OPENING_TALLER_THAN_WALL',
        `opening "${o.id}" is ${o.height_ft} ft tall in a ${space.height_ft} ft space`,
        [o.id],
      );
    }

    if (o.sill_ft !== undefined) {
      requireNonNegative(`opening "${o.id}" sill_ft`, o.sill_ft, o.id);
      if (o.sill_ft + o.height_ft > space.height_ft) {
        throw new GeometryError(
          'OPENING_ABOVE_CEILING',
          `opening "${o.id}" head is at ${o.sill_ft + o.height_ft} ft in a ${space.height_ft} ft space`,
          [o.id],
        );
      }
    }

    if (o.offset_ft !== undefined) {
      requireNonNegative(`opening "${o.id}" offset_ft`, o.offset_ft, o.id);
      if (o.offset_ft + o.width_ft > wallLen) {
        throw new GeometryError(
          'OPENING_OFF_WALL',
          `opening "${o.id}" ends at ${o.offset_ft + o.width_ft} ft on wall ${o.wall}, which is ${wallLen} ft long`,
          [o.id],
        );
      }
    }
  }

  for (const wall of WALL_IDS) {
    validateWallRun(space, wall);
  }
}

function validateWallRun(space: Space, wall: WallId): void {
  const on = space.openings.filter((o) => o.wall === wall);
  if (on.length === 0) return;

  const wallLen = wallLengthFt(space, wall);
  const totalWidth = on.reduce((sum, o) => sum + o.width_ft, 0);
  if (totalWidth > wallLen) {
    throw new GeometryError(
      'OPENINGS_EXCEED_WALL_LENGTH',
      `openings on wall ${wall} total ${totalWidth} ft on a ${wallLen} ft wall`,
      on.map((o) => o.id),
    );
  }

  // Overlap is only decidable when every opening on the wall is positioned.
  const positioned = on.filter((o) => o.offset_ft !== undefined);
  if (positioned.length !== on.length) return;

  const sorted = [...positioned].sort((a, b) => (a.offset_ft ?? 0) - (b.offset_ft ?? 0));
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1] as Opening;
    const cur = sorted[i] as Opening;
    const prevEnd = (prev.offset_ft ?? 0) + prev.width_ft;
    if ((cur.offset_ft ?? 0) < prevEnd) {
      throw new GeometryError(
        'OPENINGS_OVERLAP',
        `openings "${prev.id}" and "${cur.id}" overlap on wall ${wall}`,
        [prev.id, cur.id],
      );
    }
  }
}

export function floorAreaSF(space: Space): number {
  return space.width_ft * space.depth_ft;
}

export function ceilingAreaSF(space: Space): number {
  return space.width_ft * space.depth_ft;
}

export function grossPerimeterLF(space: Space): number {
  return 2 * (space.width_ft + space.depth_ft);
}

export function grossWallAreaSF(space: Space): number {
  return grossPerimeterLF(space) * space.height_ft;
}

export function openingAreaSF(space: Space): number {
  return space.openings.reduce((sum, o) => sum + o.width_ft * o.height_ft, 0);
}

export function netWallAreaSF(space: Space): number {
  return grossWallAreaSF(space) - openingAreaSF(space);
}

/** Perimeter for trim: full perimeter less every door width. */
export function perimeterLF(space: Space): number {
  const doorWidth = space.openings
    .filter((o) => o.kind === 'door')
    .reduce((sum, o) => sum + o.width_ft, 0);
  return grossPerimeterLF(space) - doorWidth;
}

export function countsByKind(space: Space): OpeningCounts {
  const counts: OpeningCounts = { door: 0, window: 0, opening: 0 };
  for (const o of space.openings) {
    const kind: OpeningKind = o.kind;
    counts[kind] += 1;
  }
  return counts;
}

/** Validates, then computes every quantity in one pass. */
export function takeoff(space: Space): Takeoff {
  validateSpace(space);
  return {
    floorAreaSF: floorAreaSF(space),
    ceilingAreaSF: ceilingAreaSF(space),
    grossWallAreaSF: grossWallAreaSF(space),
    netWallAreaSF: netWallAreaSF(space),
    openingAreaSF: openingAreaSF(space),
    perimeterLF: perimeterLF(space),
    grossPerimeterLF: grossPerimeterLF(space),
    countsByKind: countsByKind(space),
  };
}
