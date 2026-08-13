import { describe, expect, it } from 'vitest';

import seedJson from '../src/ratebook.seed.json';
import {
  RateBookError,
  type RateEntry,
  isIsoDate,
  loadRateBook,
  requireEntry,
  validateRateBook,
} from '../src/ratebook';

/** A valid entry to mutate one field at a time — each test proves one rule bites. */
function goodEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: 'TEST-001',
    trade: 'Testing',
    name: 'A perfectly fine line item',
    unit: 'SF',
    quantityBasis: 'floorAreaSF',
    materialCostPerUnit: 1.25,
    laborHoursPerUnit: 0.02,
    wasteFactor: 0.1,
    tierMultipliers: { good: 0.85, better: 1, best: 1.35 },
    source: 'test-fixture',
    effectiveDate: '2026-08-08',
    ...overrides,
  };
}

/** Asserts the book is refused, and that the named issue code is among the reasons. */
function expectRateBookRejection(input: unknown, code: string): RateBookError {
  let caught: unknown;
  try {
    loadRateBook(input);
  } catch (e) {
    caught = e;
  }
  expect(caught, 'expected a RateBookError, but nothing was thrown').toBeInstanceOf(RateBookError);
  const err = caught as RateBookError;
  expect(err.issues.map((i) => i.code)).toContain(code);
  return err;
}

describe('ACCEPTANCE — the seed rate book', () => {
  const book = loadRateBook(seedJson);

  it('validates clean', () => {
    expect(validateRateBook(seedJson)).toEqual([]);
  });

  it('leads with flooring, then painting — the first two trades', () => {
    const trades = book.entries.map((e) => e.trade);
    const firstPaint = trades.indexOf('Painting');
    const lastFloor = trades.lastIndexOf('Flooring');
    expect(trades).toContain('Flooring');
    expect(firstPaint).toBeGreaterThan(lastFloor);
  });

  it('covers the flooring scope ESTIMATOR1 named', () => {
    const codes = book.entries.map((e) => e.code);
    expect(codes).toContain('FL-LVP-001');
    expect(codes).toContain('FL-DEMO-001');
    expect(codes).toContain('FL-UNDER-001');
    expect(codes).toContain('FL-BASE-RR-001');
    expect(codes).toContain('FL-TRANS-001');
  });

  it('covers the painting scope ESTIMATOR1 named', () => {
    const codes = book.entries.map((e) => e.code);
    expect(codes).toContain('PT-WALL-001');
    expect(codes).toContain('PT-CEIL-001');
    expect(codes).toContain('PT-PRIME-001');
    expect(codes).toContain('PT-PATCH-001');
  });

  it('labels every number a placeholder, effective 2026-08-08', () => {
    for (const e of book.entries) {
      expect(e.source).toBe('seed-v0-placeholder');
      expect(e.effectiveDate).toBe('2026-08-08');
    }
  });

  it('indexes by code and hands back frozen entries', () => {
    const lvp = requireEntry(book, 'FL-LVP-001');
    expect(lvp.unit).toBe('SF');
    expect(Object.isFrozen(lvp)).toBe(true);
    expect(() => {
      (lvp as unknown as RateEntry).materialCostPerUnit = 999;
    }).toThrow();
  });
});

describe('REJECTION — a rate book that fails validation never prices anything', () => {
  it('refuses a non-array', () => {
    expectRateBookRejection({ entries: [] }, 'NOT_AN_ARRAY');
    expectRateBookRejection(null, 'NOT_AN_ARRAY');
    expectRateBookRejection('FL-LVP-001', 'NOT_AN_ARRAY');
  });

  it('refuses a non-object entry', () => {
    expectRateBookRejection([goodEntry(), 42], 'NOT_AN_OBJECT');
  });

  it('refuses a missing effectiveDate', () => {
    expectRateBookRejection([goodEntry({ effectiveDate: undefined })], 'INVALID_EFFECTIVE_DATE');
  });

  it('refuses an effectiveDate that is not YYYY-MM-DD', () => {
    expectRateBookRejection([goodEntry({ effectiveDate: '08/08/2026' })], 'INVALID_EFFECTIVE_DATE');
    expectRateBookRejection([goodEntry({ effectiveDate: '2026-8-8' })], 'INVALID_EFFECTIVE_DATE');
  });

  it('refuses a date that looks well-formed but is not on the calendar', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-08-08')).toBe(true);
    expectRateBookRejection([goodEntry({ effectiveDate: '2026-02-30' })], 'INVALID_EFFECTIVE_DATE');
  });

  it('refuses negative material cost', () => {
    expectRateBookRejection([goodEntry({ materialCostPerUnit: -0.01 })], 'NEGATIVE_COST');
  });

  it('refuses negative labor hours', () => {
    expectRateBookRejection([goodEntry({ laborHoursPerUnit: -1 })], 'NEGATIVE_LABOR');
  });

  it('refuses a non-numeric cost', () => {
    expectRateBookRejection([goodEntry({ materialCostPerUnit: '3.10' })], 'NEGATIVE_COST');
    expectRateBookRejection([goodEntry({ materialCostPerUnit: NaN })], 'NEGATIVE_COST');
  });

  it('refuses wasteFactor below 0 or above 0.5', () => {
    expectRateBookRejection([goodEntry({ wasteFactor: -0.01 })], 'WASTE_OUT_OF_RANGE');
    expectRateBookRejection([goodEntry({ wasteFactor: 0.51 })], 'WASTE_OUT_OF_RANGE');
    expectRateBookRejection([goodEntry({ wasteFactor: 1 })], 'WASTE_OUT_OF_RANGE');
  });

  it('accepts wasteFactor exactly at the 0 and 0.5 boundaries', () => {
    expect(validateRateBook([goodEntry({ wasteFactor: 0 })])).toEqual([]);
    expect(validateRateBook([goodEntry({ code: 'B', wasteFactor: 0.5 })])).toEqual([]);
  });

  it('refuses an unknown unit', () => {
    expectRateBookRejection([goodEntry({ unit: 'SQUARE' })], 'UNKNOWN_UNIT');
    expectRateBookRejection([goodEntry({ unit: 'sf' })], 'UNKNOWN_UNIT');
    expectRateBookRejection([goodEntry({ unit: undefined })], 'UNKNOWN_UNIT');
  });

  it('refuses an unknown quantity basis', () => {
    expectRateBookRejection([goodEntry({ quantityBasis: 'vibes' })], 'UNKNOWN_QUANTITY_BASIS');
  });

  it('refuses a missing or blank code, and duplicate codes', () => {
    expectRateBookRejection([goodEntry({ code: '   ' })], 'INVALID_CODE');
    expectRateBookRejection([goodEntry(), goodEntry()], 'DUPLICATE_CODE');
  });

  it('refuses a missing source — a number with no provenance does not ship', () => {
    expectRateBookRejection([goodEntry({ source: '' })], 'MISSING_SOURCE');
  });

  it('refuses missing trade or name', () => {
    expectRateBookRejection([goodEntry({ trade: undefined })], 'MISSING_FIELD');
    expectRateBookRejection([goodEntry({ name: '' })], 'MISSING_FIELD');
  });

  it('refuses broken tier multipliers', () => {
    expectRateBookRejection([goodEntry({ tierMultipliers: undefined })], 'INVALID_TIER_MULTIPLIER');
    expectRateBookRejection(
      [goodEntry({ tierMultipliers: { good: 0.85, better: 1 } })],
      'INVALID_TIER_MULTIPLIER',
    );
    expectRateBookRejection(
      [goodEntry({ tierMultipliers: { good: 0, better: 1, best: 1.35 } })],
      'INVALID_TIER_MULTIPLIER',
    );
  });

  it('reports every problem at once, not just the first', () => {
    const err = expectRateBookRejection(
      [goodEntry({ unit: 'SQUARE', wasteFactor: 9, effectiveDate: 'soon', source: '' })],
      'UNKNOWN_UNIT',
    );
    const codes = err.issues.map((i) => i.code);
    expect(codes).toContain('WASTE_OUT_OF_RANGE');
    expect(codes).toContain('INVALID_EFFECTIVE_DATE');
    expect(codes).toContain('MISSING_SOURCE');
    expect(err.issues.length).toBeGreaterThanOrEqual(4);
  });

  it('names the offending entry so a human can find it', () => {
    const err = expectRateBookRejection(
      [goodEntry(), goodEntry({ code: 'BAD-002', wasteFactor: 3 })],
      'WASTE_OUT_OF_RANGE',
    );
    const issue = err.issues.find((i) => i.code === 'WASTE_OUT_OF_RANGE');
    expect(issue?.entryCode).toBe('BAD-002');
    expect(issue?.index).toBe(1);
    expect(issue?.field).toBe('wasteFactor');
  });

  it('refuses a lookup for a code it does not have', () => {
    const book = loadRateBook(seedJson);
    expect(() => requireEntry(book, 'NOPE-999')).toThrow(RateBookError);
  });
});
