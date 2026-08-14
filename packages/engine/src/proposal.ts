/**
 * Proposal — the contractor-facing output.
 *
 * The one rule this module exists to enforce: a proposal built on placeholder pricing
 * REFUSES to exist without saying so on its face. Kevin must never hand a customer a
 * number that looks like a market rate and is not.
 *
 * Still pure. `preparedOn` is an input.
 */

import type { RateBook } from './ratebook';
import type { Tier } from './ratebook';
import type { TrustLevel } from './roomgraph';
import {
  type Project,
  type ProjectEstimate,
  buildProjectEstimate,
  tierTotals,
} from './project';

/** The exact words that must appear on any proposal priced from the seed book. */
export const PLACEHOLDER_PRICING_NOTICE = 'Placeholder pricing — not market rates.';

/** A proposal built on these sources must carry the notice. */
export const PLACEHOLDER_SOURCES: readonly string[] = ['seed-v0-placeholder'];

export type ProposalErrorCode = 'PRICING_NOTICE_REQUIRED' | 'PRICING_NOTICE_INADEQUATE';

export class ProposalError extends Error {
  readonly code: ProposalErrorCode;

  constructor(code: ProposalErrorCode, message: string) {
    super(message);
    this.name = 'ProposalError';
    this.code = code;
  }
}

/**
 * The ladder the mock shows. M1 can only ever DERIVE the first two rungs; the last two
 * need a human sign-off that does not exist yet, so they are modelled as unreachable
 * rather than left off — the contractor should see what is still ahead of them.
 */
export const TRUST_LADDER = [
  'preliminary',
  'measurement-backed',
  'field-verified',
  'contract-ready',
] as const;

export type TrustRung = (typeof TRUST_LADDER)[number];

export interface TrustLadderRung {
  rung: TrustRung;
  /** True for the one rung this project has actually reached. */
  current: boolean;
  /** True when the rung is beyond what M1 can derive at all. */
  unavailableInM1: boolean;
}

export interface ProposalTierCard {
  tier: Tier;
  totalCents: number | null;
  description: string;
  selected: boolean;
}

export interface ProposalScopeLine {
  roomName: string;
  name: string;
  trade: string;
  qtyLabel: string;
  qtySource: string;
}

export interface ProposalMeasurement {
  roomName: string;
  dimensions: string;
  floorAreaSF: number;
  netWallAreaSF: number;
  perimeterLF: number;
  doors: number;
  windows: number;
}

export interface Proposal {
  projectName: string;
  client: string;
  address: string;
  /** ISO date supplied by the caller. */
  preparedOn: string;
  trustLevel: TrustLevel;
  trustLadder: readonly TrustLadderRung[];
  tiers: readonly ProposalTierCard[];
  scope: readonly ProposalScopeLine[];
  measurements: readonly ProposalMeasurement[];
  assumptions: readonly string[];
  exclusions: readonly string[];
  /** Never optional. A proposal without it does not get built. */
  pricingNotice: string;
  pricingSources: readonly { source: string; effectiveDate: string }[];
  totalCents: number;
  estimate: ProjectEstimate;
}

const TIER_DESCRIPTION: Record<Tier, string> = {
  good: 'Solid materials, standard finish',
  better: 'Upgraded materials, most popular',
  best: 'Premium materials & finish',
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ProposalOptions {
  preparedOn: string;
  /** Must state that the pricing is not a market rate. Blank is a refusal, not a default. */
  pricingNotice?: string;
}

/**
 * Builds the client-facing proposal, or refuses.
 *
 * Refuses when the pricing notice is missing, blank, or does not actually say the numbers
 * are not market rates — a notice that does not warn is not a notice.
 */
export function buildProposal(
  project: Project,
  book: RateBook,
  options: ProposalOptions,
): Proposal {
  const notice = options.pricingNotice;

  if (notice === undefined || notice.trim() === '') {
    throw new ProposalError(
      'PRICING_NOTICE_REQUIRED',
      'a proposal priced from placeholder rates must carry the placeholder-pricing notice',
    );
  }
  if (!/not\s+market\s+rates/i.test(notice)) {
    throw new ProposalError(
      'PRICING_NOTICE_INADEQUATE',
      `the pricing notice must state that these are not market rates, got ${JSON.stringify(notice)}`,
    );
  }

  // Throws ProjectError / EstimateError / GeometryError before anything is rendered.
  const estimate = buildProjectEstimate(project, book);

  const trustLadder: TrustLadderRung[] = TRUST_LADDER.map((rung) => ({
    rung,
    current: rung === estimate.trustLevel,
    unavailableInM1: rung === 'field-verified' || rung === 'contract-ready',
  }));

  const scope: ProposalScopeLine[] = estimate.rooms.flatMap((room) =>
    room.estimate.lines.map((l) => ({
      roomName: room.roomName,
      name: l.name,
      trade: l.trade,
      qtyLabel: `${round(l.qty).toLocaleString('en-US')} ${l.unit}`,
      qtySource: l.qtySource,
    })),
  );

  const measurements: ProposalMeasurement[] = estimate.rooms.map((room) => {
    const t = room.estimate.takeoff;
    const s = project.rooms.find((r) => r.id === room.roomId)?.space;
    return {
      roomName: room.roomName,
      dimensions: s ? `${s.width_ft} × ${s.depth_ft} × ${s.height_ft} ft` : 'unknown',
      floorAreaSF: round(t.floorAreaSF),
      netWallAreaSF: round(t.netWallAreaSF),
      perimeterLF: round(t.perimeterLF),
      doors: t.countsByKind.door,
      windows: t.countsByKind.window,
    };
  });

  return {
    projectName: project.name,
    client: project.client,
    address: project.address,
    preparedOn: options.preparedOn,
    trustLevel: estimate.trustLevel,
    trustLadder,
    tiers: tierTotals(project, book).map((t) => ({
      tier: t.tier,
      totalCents: t.totalCents,
      description: TIER_DESCRIPTION[t.tier],
      selected: t.tier === project.config.tier,
    })),
    scope,
    measurements,
    assumptions: estimate.assumptions,
    exclusions: estimate.exclusions,
    pricingNotice: notice,
    pricingSources: estimate.pricingSources,
    totalCents: estimate.totals.totalCents,
    estimate,
  };
}
