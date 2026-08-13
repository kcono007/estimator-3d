/**
 * RoomGraph v0 — the geometry contract.
 *
 * Pure types plus the one derivation the product rule insists on: trust level is
 * COMPUTED from where the dimensions came from. Nobody gets to hand-assign it.
 */

/** Where a dimension came from. Every dimension carries one. */
export type DimSource = 'measured' | 'manual' | 'inferred';

export const DIM_SOURCES: readonly DimSource[] = ['measured', 'manual', 'inferred'];

export type OpeningKind = 'door' | 'window' | 'opening';

export const OPENING_KINDS: readonly OpeningKind[] = ['door', 'window', 'opening'];

/** Compass wall id. N/S walls run the width; E/W walls run the depth. */
export type WallId = 'N' | 'S' | 'E' | 'W';

export const WALL_IDS: readonly WallId[] = ['N', 'S', 'E', 'W'];

export interface Opening {
  id: string;
  kind: OpeningKind;
  wall: WallId;
  width_ft: number;
  height_ft: number;
  /** Height of the sill above the floor. Doors normally omit it. */
  sill_ft?: number;
  /**
   * Distance from the wall's left edge to the opening's left edge.
   *
   * NOT in the ESTIMATOR1 spec's Opening shape, added because it is REQUIRED to detect
   * "openings on one wall overlapping" — the rejection the spec mandates. Optional: when
   * every opening on a wall carries one, overlap and run-off-the-end are both checked;
   * when absent, only the weaker sum-of-widths-vs-wall-length check applies.
   */
  offset_ft?: number;
  dimensionSource: DimSource;
}

export interface Space {
  id: string;
  name: string;
  width_ft: number;
  depth_ft: number;
  height_ft: number;
  /** Source of the space's own W/D/H. Openings carry their own. */
  dimensionSource: DimSource;
  openings: Opening[];
}

/**
 * Derived confidence in an estimate's numbers.
 *
 * M1 derives only these two. `field-verified` and `contract-ready` arrive in later
 * milestones and require a human sign-off artifact — they are deliberately absent here
 * so nothing can claim them by accident.
 */
export type TrustLevel = 'measurement-backed' | 'preliminary';

/** Length of a wall in feet: N/S span the width, E/W span the depth. */
export function wallLengthFt(space: Space, wall: WallId): number {
  return wall === 'N' || wall === 'S' ? space.width_ft : space.depth_ft;
}

/** Every dimension source in the space, the space's own first, then its openings'. */
export function dimensionSources(space: Space): DimSource[] {
  return [space.dimensionSource, ...space.openings.map((o) => o.dimensionSource)];
}

/**
 * DERIVED, never set by hand: all measured -> measurement-backed; anything else ->
 * preliminary. One manual window drags the whole estimate down to preliminary, which is
 * the honest answer.
 */
export function deriveTrustLevel(space: Space): TrustLevel {
  return dimensionSources(space).every((s) => s === 'measured')
    ? 'measurement-backed'
    : 'preliminary';
}

export function isDimSource(value: unknown): value is DimSource {
  return typeof value === 'string' && (DIM_SOURCES as readonly string[]).includes(value);
}

export function isOpeningKind(value: unknown): value is OpeningKind {
  return typeof value === 'string' && (OPENING_KINDS as readonly string[]).includes(value);
}

export function isWallId(value: unknown): value is WallId {
  return typeof value === 'string' && (WALL_IDS as readonly string[]).includes(value);
}
