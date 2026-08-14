/**
 * Project — a named job holding one or more scoped rooms.
 *
 * Still pure. `createdAt` is an INPUT, never a clock read, and project ids are supplied
 * by the caller — the web layer owns the clock and the entropy, the engine owns the math.
 *
 * This module does not rewrite anything in M1; it composes buildEstimate() across rooms.
 */

import { type Space, type TrustLevel, deriveTrustLevel } from './roomgraph';
import type { RateBook } from './ratebook';
import {
  type Estimate,
  EstimateError,
  type EstimateConfig,
  type EstimateTotals,
  type Selection,
  buildEstimate,
} from './estimate';

export type ProjectErrorCode =
  | 'NO_ROOMS'
  | 'NO_SCOPE'
  | 'DUPLICATE_ROOM_ID'
  | 'INVALID_PROJECT_ID'
  | 'INVALID_CREATED_AT'
  | 'ROOM_NOT_FOUND';

/** Typed refusal at the project level. */
export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  readonly roomId: string | null;

  constructor(code: ProjectErrorCode, message: string, roomId: string | null = null) {
    super(message);
    this.name = 'ProjectError';
    this.code = code;
    this.roomId = roomId;
  }
}

export interface RoomScope {
  id: string;
  space: Space;
  /** Empty is allowed: the room is measured but not yet scoped, so it prices nothing. */
  selections: Selection[];
}

export interface Project {
  id: string;
  name: string;
  client: string;
  address: string;
  /** ISO date, supplied by the caller. The engine never asks what time it is. */
  createdAt: string;
  rooms: RoomScope[];
  config: EstimateConfig;
}

export interface RoomEstimate {
  roomId: string;
  roomName: string;
  estimate: Estimate;
}

export interface ProjectEstimate {
  projectId: string;
  projectName: string;
  client: string;
  address: string;
  createdAt: string;
  /** Only rooms that carry at least one selection are priced. */
  rooms: readonly RoomEstimate[];
  /** Rooms measured but not yet scoped — surfaced, never silently dropped. */
  unscopedRoomIds: readonly string[];
  totals: EstimateTotals;
  /** DERIVED across every room, weakest wins. Never an input. */
  trustLevel: TrustLevel;
  tier: EstimateConfig['tier'];
  laborRatePerHour: number;
  opPct: number;
  assumptions: readonly string[];
  exclusions: readonly string[];
  pricingSources: readonly { source: string; effectiveDate: string }[];
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

/**
 * Weakest link across every room. One manual dimension anywhere drags the whole project
 * to preliminary — a project is only as trustworthy as its shakiest measurement.
 */
export function deriveProjectTrustLevel(rooms: readonly { space: Space }[]): TrustLevel {
  if (rooms.length === 0) return 'preliminary';
  return rooms.every((r) => deriveTrustLevel(r.space) === 'measurement-backed')
    ? 'measurement-backed'
    : 'preliminary';
}

export function validateProject(project: Project): void {
  if (typeof project.id !== 'string' || project.id.trim() === '') {
    throw new ProjectError('INVALID_PROJECT_ID', 'a project needs a non-empty id');
  }
  if (!ISO_DATE_TIME.test(project.createdAt)) {
    throw new ProjectError(
      'INVALID_CREATED_AT',
      `createdAt must start with an ISO date, got ${JSON.stringify(project.createdAt)}`,
    );
  }
  const seen = new Set<string>();
  for (const room of project.rooms) {
    if (seen.has(room.id)) {
      throw new ProjectError('DUPLICATE_ROOM_ID', `duplicate room id "${room.id}"`, room.id);
    }
    seen.add(room.id);
  }
}

/**
 * Prices every scoped room and sums them.
 *
 * Refuses a project with no rooms, and a project where no room has been scoped — an
 * estimate of nothing is not an estimate, and returning $0 would look like an answer.
 */
export function buildProjectEstimate(project: Project, book: RateBook): ProjectEstimate {
  validateProject(project);

  if (project.rooms.length === 0) {
    throw new ProjectError(
      'NO_ROOMS',
      `project "${project.name}" has no rooms — measure a room before asking for a price`,
    );
  }

  const scoped = project.rooms.filter((r) => r.selections.length > 0);
  if (scoped.length === 0) {
    throw new ProjectError(
      'NO_SCOPE',
      `project "${project.name}" has no scope selected — pick what you are building first`,
    );
  }

  const rooms: RoomEstimate[] = scoped.map((room) => ({
    roomId: room.id,
    roomName: room.space.name,
    estimate: buildEstimate(room.space, room.selections, book, project.config),
  }));

  const totals: EstimateTotals = rooms.reduce<EstimateTotals>(
    (acc, r) => ({
      materialCents: acc.materialCents + r.estimate.totals.materialCents,
      laborCents: acc.laborCents + r.estimate.totals.laborCents,
      laborHours: acc.laborHours + r.estimate.totals.laborHours,
      opCents: acc.opCents + r.estimate.totals.opCents,
      subtotalCents: acc.subtotalCents + r.estimate.totals.subtotalCents,
      totalCents: acc.totalCents + r.estimate.totals.totalCents,
    }),
    {
      materialCents: 0,
      laborCents: 0,
      laborHours: 0,
      opCents: 0,
      subtotalCents: 0,
      totalCents: 0,
    },
  );

  const sourceKeys = new Set<string>();
  const pricingSources: { source: string; effectiveDate: string }[] = [];
  for (const r of rooms) {
    for (const s of r.estimate.pricingSources) {
      const key = `${s.source}@${s.effectiveDate}`;
      if (!sourceKeys.has(key)) {
        sourceKeys.add(key);
        pricingSources.push(s);
      }
    }
  }

  return {
    projectId: project.id,
    projectName: project.name,
    client: project.client,
    address: project.address,
    createdAt: project.createdAt,
    rooms,
    unscopedRoomIds: project.rooms.filter((r) => r.selections.length === 0).map((r) => r.id),
    totals,
    // Derived from EVERY room, including the ones with no scope — an unmeasured room
    // still tells you how much to trust the job.
    trustLevel: deriveProjectTrustLevel(project.rooms),
    tier: project.config.tier,
    laborRatePerHour: project.config.laborRatePerHour,
    opPct: project.config.opPct,
    assumptions: project.config.assumptions ?? [],
    exclusions: project.config.exclusions ?? [],
    pricingSources,
  };
}

/**
 * Totals at every tier, for the Good/Better/Best cards. Returns nulls for tiers that
 * refuse rather than swallowing the error — the caller decides how to show a refusal.
 */
export function tierTotals(
  project: Project,
  book: RateBook,
): { tier: EstimateConfig['tier']; totalCents: number | null }[] {
  return (['good', 'better', 'best'] as const).map((tier) => {
    try {
      return {
        tier,
        totalCents: buildProjectEstimate({ ...project, config: { ...project.config, tier } }, book)
          .totals.totalCents,
      };
    } catch (e) {
      if (e instanceof ProjectError || e instanceof EstimateError) return { tier, totalCents: null };
      throw e;
    }
  });
}
