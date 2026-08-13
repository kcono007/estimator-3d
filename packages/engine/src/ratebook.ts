/**
 * Rate book — load and validate. A rate book that fails validation never prices anything.
 *
 * Validation collects EVERY problem before throwing, because handing back one error at a
 * time turns fixing a price file into twenty round trips.
 */

export type Unit = 'SF' | 'LF' | 'EA';

export const UNITS: readonly Unit[] = ['SF', 'LF', 'EA'];

/**
 * Which takeoff formula supplies this line's quantity.
 *
 * NOT in the ESTIMATOR1 spec's entry shape, added because "quantity per line = takeoff
 * formula" is otherwise undefined — the unit alone cannot tell floor SF from wall SF.
 */
export type QuantityBasis =
  | 'floorAreaSF'
  | 'ceilingAreaSF'
  | 'grossWallAreaSF'
  | 'netWallAreaSF'
  | 'perimeterLF'
  | 'doorCount'
  | 'windowCount'
  | 'openingCount';

export const QUANTITY_BASES: readonly QuantityBasis[] = [
  'floorAreaSF',
  'ceilingAreaSF',
  'grossWallAreaSF',
  'netWallAreaSF',
  'perimeterLF',
  'doorCount',
  'windowCount',
  'openingCount',
];

export interface TierMultipliers {
  good: number;
  better: number;
  best: number;
}

export type Tier = keyof TierMultipliers;

export const TIERS: readonly Tier[] = ['good', 'better', 'best'];

export interface RateEntry {
  code: string;
  trade: string;
  name: string;
  unit: Unit;
  quantityBasis: QuantityBasis;
  /** Dollars per unit. Converted to cents once, at the line, in estimate.ts. */
  materialCostPerUnit: number;
  laborHoursPerUnit: number;
  /** 0 .. 0.5 inclusive. A 60% waste factor is a typo, not a rate. */
  wasteFactor: number;
  tierMultipliers: TierMultipliers;
  source: string;
  /** ISO calendar date, YYYY-MM-DD. Never derived from the clock. */
  effectiveDate: string;
}

export interface RateBook {
  entries: readonly RateEntry[];
  byCode: ReadonlyMap<string, RateEntry>;
}

export type RateBookIssueCode =
  | 'NOT_AN_ARRAY'
  | 'NOT_AN_OBJECT'
  | 'MISSING_FIELD'
  | 'INVALID_CODE'
  | 'DUPLICATE_CODE'
  | 'UNKNOWN_UNIT'
  | 'UNKNOWN_QUANTITY_BASIS'
  | 'NEGATIVE_COST'
  | 'NEGATIVE_LABOR'
  | 'WASTE_OUT_OF_RANGE'
  | 'INVALID_TIER_MULTIPLIER'
  | 'MISSING_SOURCE'
  | 'INVALID_EFFECTIVE_DATE';

export interface RateBookIssue {
  code: RateBookIssueCode;
  /** Index in the input array, or -1 when the input itself is the problem. */
  index: number;
  /** Entry code when known. */
  entryCode: string | null;
  field: string | null;
  message: string;
}

/** Typed refusal. Carries every issue found, not just the first. */
export class RateBookError extends Error {
  readonly issues: readonly RateBookIssue[];
  /** Convenience: the first issue's code, so callers can switch without indexing. */
  readonly code: RateBookIssueCode;

  constructor(issues: RateBookIssue[]) {
    const head = issues[0];
    super(
      `rate book invalid — ${issues.length} issue(s): ` +
        issues.map((i) => `[${i.code}] ${i.message}`).join('; '),
    );
    this.name = 'RateBookError';
    this.issues = issues;
    this.code = head ? head.code : 'NOT_AN_ARRAY';
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar date in YYYY-MM-DD form. Uses Date purely as a calendar
 * lookup on an explicit input — it never reads the clock, so the engine stays pure.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Checks a raw rate book and returns every problem it finds. Empty array = valid.
 * Does not throw — `loadRateBook` is the throwing door.
 */
export function validateRateBook(input: unknown): RateBookIssue[] {
  const issues: RateBookIssue[] = [];
  const push = (
    code: RateBookIssueCode,
    index: number,
    entryCode: string | null,
    field: string | null,
    message: string,
  ): void => {
    issues.push({ code, index, entryCode, field, message });
  };

  if (!Array.isArray(input)) {
    push('NOT_AN_ARRAY', -1, null, null, 'rate book must be an array of entries');
    return issues;
  }

  const seen = new Set<string>();

  input.forEach((raw, index) => {
    if (!isPlainObject(raw)) {
      push('NOT_AN_OBJECT', index, null, null, `entry ${index} is not an object`);
      return;
    }

    const entryCode = isNonEmptyString(raw['code']) ? raw['code'] : null;
    const at = entryCode ?? `#${index}`;

    if (entryCode === null) {
      push('INVALID_CODE', index, null, 'code', `entry ${index} has no non-empty code`);
    } else if (seen.has(entryCode)) {
      push('DUPLICATE_CODE', index, entryCode, 'code', `duplicate code "${entryCode}"`);
    } else {
      seen.add(entryCode);
    }

    for (const field of ['trade', 'name'] as const) {
      if (!isNonEmptyString(raw[field])) {
        push('MISSING_FIELD', index, entryCode, field, `${at}: ${field} is required`);
      }
    }

    if (!(UNITS as readonly unknown[]).includes(raw['unit'])) {
      push(
        'UNKNOWN_UNIT',
        index,
        entryCode,
        'unit',
        `${at}: unknown unit ${JSON.stringify(raw['unit'])} (expected ${UNITS.join(', ')})`,
      );
    }

    if (!(QUANTITY_BASES as readonly unknown[]).includes(raw['quantityBasis'])) {
      push(
        'UNKNOWN_QUANTITY_BASIS',
        index,
        entryCode,
        'quantityBasis',
        `${at}: unknown quantityBasis ${JSON.stringify(raw['quantityBasis'])}`,
      );
    }

    const mat = raw['materialCostPerUnit'];
    if (!isFiniteNumber(mat) || mat < 0) {
      push(
        'NEGATIVE_COST',
        index,
        entryCode,
        'materialCostPerUnit',
        `${at}: materialCostPerUnit must be a finite number >= 0, got ${JSON.stringify(mat)}`,
      );
    }

    const hrs = raw['laborHoursPerUnit'];
    if (!isFiniteNumber(hrs) || hrs < 0) {
      push(
        'NEGATIVE_LABOR',
        index,
        entryCode,
        'laborHoursPerUnit',
        `${at}: laborHoursPerUnit must be a finite number >= 0, got ${JSON.stringify(hrs)}`,
      );
    }

    const waste = raw['wasteFactor'];
    if (!isFiniteNumber(waste) || waste < 0 || waste > 0.5) {
      push(
        'WASTE_OUT_OF_RANGE',
        index,
        entryCode,
        'wasteFactor',
        `${at}: wasteFactor must be between 0 and 0.5, got ${JSON.stringify(waste)}`,
      );
    }

    const tiers = raw['tierMultipliers'];
    if (!isPlainObject(tiers)) {
      push(
        'INVALID_TIER_MULTIPLIER',
        index,
        entryCode,
        'tierMultipliers',
        `${at}: tierMultipliers must be an object with good, better, best`,
      );
    } else {
      for (const tier of TIERS) {
        const m = tiers[tier];
        if (!isFiniteNumber(m) || m <= 0) {
          push(
            'INVALID_TIER_MULTIPLIER',
            index,
            entryCode,
            `tierMultipliers.${tier}`,
            `${at}: tierMultipliers.${tier} must be a finite number > 0, got ${JSON.stringify(m)}`,
          );
        }
      }
    }

    if (!isNonEmptyString(raw['source'])) {
      push('MISSING_SOURCE', index, entryCode, 'source', `${at}: source is required`);
    }

    if (!isIsoDate(raw['effectiveDate'])) {
      push(
        'INVALID_EFFECTIVE_DATE',
        index,
        entryCode,
        'effectiveDate',
        `${at}: effectiveDate must be a real YYYY-MM-DD date, got ${JSON.stringify(
          raw['effectiveDate'],
        )}`,
      );
    }
  });

  return issues;
}

/** Validates and freezes a rate book. Throws RateBookError if anything is wrong. */
export function loadRateBook(input: unknown): RateBook {
  const issues = validateRateBook(input);
  if (issues.length > 0) throw new RateBookError(issues);

  const entries = (input as RateEntry[]).map((e) => Object.freeze({ ...e }));
  const byCode = new Map<string, RateEntry>(entries.map((e) => [e.code, e]));
  return Object.freeze({ entries: Object.freeze(entries), byCode });
}

/** Lookup that refuses rather than returning undefined. */
export function requireEntry(book: RateBook, code: string): RateEntry {
  const entry = book.byCode.get(code);
  if (!entry) {
    throw new RateBookError([
      {
        code: 'INVALID_CODE',
        index: -1,
        entryCode: code,
        field: 'code',
        message: `no rate book entry for code "${code}"`,
      },
    ]);
  }
  return entry;
}
