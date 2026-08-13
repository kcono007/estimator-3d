/**
 * Estimate — line items, tiers, O&P, totals.
 *
 * Money is integer cents. Each line rounds to cents EXACTLY ONCE, from full-precision
 * inputs, so totals never drift by a penny per line. Dollars appear only at the display
 * edge (`centsToDollarString`).
 *
 * Nothing here reads a clock, a network, or a random number. Same input in, byte-identical
 * output out.
 */

import { type Space, type TrustLevel, deriveTrustLevel } from './roomgraph';
import { type Takeoff, takeoff } from './takeoff';
import {
  type QuantityBasis,
  type RateBook,
  type RateEntry,
  type Tier,
  TIERS,
  type Unit,
  requireEntry,
} from './ratebook';

export type EstimateErrorCode =
  | 'UNKNOWN_ITEM_CODE'
  | 'DUPLICATE_SELECTION'
  | 'EMPTY_SELECTION'
  | 'INVALID_QTY_OVERRIDE'
  | 'INVALID_LABOR_RATE'
  | 'INVALID_OP_PCT'
  | 'INVALID_TIER';

/** Typed refusal from the pricing stage. */
export class EstimateError extends Error {
  readonly code: EstimateErrorCode;
  /** The item code at fault, when the fault belongs to one. */
  readonly itemCode: string | null;

  constructor(code: EstimateErrorCode, message: string, itemCode: string | null = null) {
    super(message);
    this.name = 'EstimateError';
    this.code = code;
    this.itemCode = itemCode;
  }
}

export type QtySource = 'measured' | 'manual';

export interface Selection {
  code: string;
  /** Overrides the takeoff formula. Flips the line's qtySource to 'manual'. */
  qtyOverride?: number;
}

export interface EstimateConfig {
  /** Dollars per labor hour. */
  laborRatePerHour: number;
  /** Overhead & profit as a fraction, e.g. 0.20 for 20%. */
  opPct: number;
  tier: Tier;
  /** Carried onto the output verbatim — the estimate states what it assumed. */
  assumptions?: readonly string[];
  /** Carried onto the output verbatim — the estimate states what it does not cover. */
  exclusions?: readonly string[];
}

export interface LineItem {
  code: string;
  trade: string;
  name: string;
  unit: Unit;
  quantityBasis: QuantityBasis;
  /** Full precision. Round for display only. */
  qty: number;
  qtySource: QtySource;
  wasteFactor: number;
  /** Quantity actually purchased: qty x (1 + waste). */
  qtyWithWaste: number;
  materialCostPerUnit: number;
  tier: Tier;
  tierMultiplier: number;
  /** materialCostPerUnit x tierMultiplier, in dollars — the rate the customer sees. */
  effectiveUnitCost: number;
  laborHoursPerUnit: number;
  laborHours: number;
  materialCents: number;
  laborCents: number;
  subtotalCents: number;
  /** Provenance travels with the money. */
  rateBookSource: string;
  effectiveDate: string;
}

export interface EstimateTotals {
  materialCents: number;
  laborCents: number;
  laborHours: number;
  opCents: number;
  /** material + labor, before O&P. */
  subtotalCents: number;
  totalCents: number;
}

export interface Estimate {
  spaceId: string;
  spaceName: string;
  takeoff: Takeoff;
  lines: readonly LineItem[];
  totals: EstimateTotals;
  /** DERIVED from the space's dimension sources. Never an input. */
  trustLevel: TrustLevel;
  tier: Tier;
  laborRatePerHour: number;
  opPct: number;
  assumptions: readonly string[];
  exclusions: readonly string[];
  /** Distinct rate book sources + effective dates behind these numbers. */
  pricingSources: readonly { source: string; effectiveDate: string }[];
}

/** Maps a rate entry's declared basis onto the computed takeoff. */
export function quantityFor(basis: QuantityBasis, t: Takeoff): number {
  switch (basis) {
    case 'floorAreaSF':
      return t.floorAreaSF;
    case 'ceilingAreaSF':
      return t.ceilingAreaSF;
    case 'grossWallAreaSF':
      return t.grossWallAreaSF;
    case 'netWallAreaSF':
      return t.netWallAreaSF;
    case 'perimeterLF':
      return t.perimeterLF;
    case 'doorCount':
      return t.countsByKind.door;
    case 'windowCount':
      return t.countsByKind.window;
    case 'openingCount':
      return t.countsByKind.opening;
  }
}

function validateConfig(config: EstimateConfig): void {
  if (!Number.isFinite(config.laborRatePerHour) || config.laborRatePerHour < 0) {
    throw new EstimateError(
      'INVALID_LABOR_RATE',
      `laborRatePerHour must be a finite number >= 0, got ${config.laborRatePerHour}`,
    );
  }
  if (!Number.isFinite(config.opPct) || config.opPct < 0 || config.opPct > 1) {
    throw new EstimateError(
      'INVALID_OP_PCT',
      `opPct must be a fraction between 0 and 1, got ${config.opPct}`,
    );
  }
  if (!(TIERS as readonly string[]).includes(config.tier)) {
    throw new EstimateError('INVALID_TIER', `unknown tier ${JSON.stringify(config.tier)}`);
  }
}

function validateSelections(selections: readonly Selection[]): void {
  if (selections.length === 0) {
    throw new EstimateError('EMPTY_SELECTION', 'an estimate needs at least one selected line item');
  }
  const seen = new Set<string>();
  for (const s of selections) {
    if (seen.has(s.code)) {
      throw new EstimateError('DUPLICATE_SELECTION', `item "${s.code}" selected twice`, s.code);
    }
    seen.add(s.code);
    if (s.qtyOverride !== undefined && (!Number.isFinite(s.qtyOverride) || s.qtyOverride < 0)) {
      throw new EstimateError(
        'INVALID_QTY_OVERRIDE',
        `qtyOverride for "${s.code}" must be a finite number >= 0, got ${s.qtyOverride}`,
        s.code,
      );
    }
  }
}

function lookup(book: RateBook, code: string): RateEntry {
  try {
    return requireEntry(book, code);
  } catch {
    throw new EstimateError('UNKNOWN_ITEM_CODE', `no rate book entry for item code "${code}"`, code);
  }
}

/** One priced line. Rounds to cents exactly once, at the end. */
export function priceLine(
  entry: RateEntry,
  t: Takeoff,
  selection: Selection,
  config: EstimateConfig,
): LineItem {
  const override = selection.qtyOverride;
  const qty = override !== undefined ? override : quantityFor(entry.quantityBasis, t);
  const qtySource: QtySource = override !== undefined ? 'manual' : 'measured';

  const tierMultiplier = entry.tierMultipliers[config.tier];
  const qtyWithWaste = qty * (1 + entry.wasteFactor);
  const laborHours = qty * entry.laborHoursPerUnit;

  const materialCents = Math.round(
    qtyWithWaste * entry.materialCostPerUnit * tierMultiplier * 100,
  );
  const laborCents = Math.round(laborHours * config.laborRatePerHour * 100);

  return {
    code: entry.code,
    trade: entry.trade,
    name: entry.name,
    unit: entry.unit,
    quantityBasis: entry.quantityBasis,
    qty,
    qtySource,
    wasteFactor: entry.wasteFactor,
    qtyWithWaste,
    materialCostPerUnit: entry.materialCostPerUnit,
    tier: config.tier,
    tierMultiplier,
    effectiveUnitCost: entry.materialCostPerUnit * tierMultiplier,
    laborHoursPerUnit: entry.laborHoursPerUnit,
    laborHours,
    materialCents,
    laborCents,
    subtotalCents: materialCents + laborCents,
    rateBookSource: entry.source,
    effectiveDate: entry.effectiveDate,
  };
}

/**
 * The whole job: takeoff the space, price every selection, apply O&P, derive trust.
 * Throws GeometryError, RateBookError, or EstimateError rather than returning a guess.
 */
export function buildEstimate(
  space: Space,
  selections: readonly Selection[],
  book: RateBook,
  config: EstimateConfig,
): Estimate {
  validateConfig(config);
  validateSelections(selections);

  const t = takeoff(space);
  const lines = selections.map((s) => priceLine(lookup(book, s.code), t, s, config));

  const materialCents = lines.reduce((sum, l) => sum + l.materialCents, 0);
  const laborCents = lines.reduce((sum, l) => sum + l.laborCents, 0);
  const laborHours = lines.reduce((sum, l) => sum + l.laborHours, 0);
  const subtotalCents = materialCents + laborCents;
  const opCents = Math.round(subtotalCents * config.opPct);

  const sourceKeys = new Set<string>();
  const pricingSources: { source: string; effectiveDate: string }[] = [];
  for (const l of lines) {
    const key = `${l.rateBookSource}@${l.effectiveDate}`;
    if (!sourceKeys.has(key)) {
      sourceKeys.add(key);
      pricingSources.push({ source: l.rateBookSource, effectiveDate: l.effectiveDate });
    }
  }

  return {
    spaceId: space.id,
    spaceName: space.name,
    takeoff: t,
    lines,
    totals: {
      materialCents,
      laborCents,
      laborHours,
      opCents,
      subtotalCents,
      totalCents: subtotalCents + opCents,
    },
    trustLevel: deriveTrustLevel(space),
    tier: config.tier,
    laborRatePerHour: config.laborRatePerHour,
    opPct: config.opPct,
    assumptions: config.assumptions ?? [],
    exclusions: config.exclusions ?? [],
    pricingSources,
  };
}

/** Display edge: integer cents to a plain dollar string, e.g. 123456 -> "1,234.56". */
export function centsToDollarString(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${dollars.toLocaleString('en-US')}.${remainder}`;
}
