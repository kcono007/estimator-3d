import { describe, expect, it } from 'vitest';

import seedJson from '../src/ratebook.seed.json';
import {
  type EstimateConfig,
  EstimateError,
  buildEstimate,
  centsToDollarString,
} from '../src/estimate';
import { loadRateBook } from '../src/ratebook';
import { goldenRoom, plainRoom } from './fixtures';

const book = loadRateBook(seedJson);

const baseConfig: EstimateConfig = {
  laborRatePerHour: 65,
  opPct: 0.2,
  tier: 'better',
};

describe('ACCEPTANCE — pricing the golden room', () => {
  const est = buildEstimate(
    goldenRoom(),
    [{ code: 'FL-LVP-001' }, { code: 'FL-BASE-RR-001' }, { code: 'PT-WALL-001' }],
    book,
    baseConfig,
  );

  const line = (code: string) => {
    const l = est.lines.find((x) => x.code === code);
    if (!l) throw new Error(`missing line ${code}`);
    return l;
  };

  it('pulls each quantity from its declared takeoff basis', () => {
    expect(line('FL-LVP-001').qty).toBe(192); // floor area
    expect(line('FL-BASE-RR-001').qty).toBe(53); // perimeter, net of the door
    expect(line('PT-WALL-001').qty).toBeCloseTo(403.99, 10); // net wall
  });

  it('prices LVP: 192 SF x 1.10 waste x $3.10 = $654.72 material, 5.376 hrs = $349.44 labor', () => {
    const l = line('FL-LVP-001');
    expect(l.qtyWithWaste).toBeCloseTo(211.2, 10);
    expect(l.materialCents).toBe(65472);
    expect(l.laborHours).toBeCloseTo(5.376, 10);
    expect(l.laborCents).toBe(34944);
    expect(l.subtotalCents).toBe(100416);
  });

  it('prices baseboard: 53 LF x 1.10 waste x $1.90 = $110.77, 2.65 hrs = $172.25', () => {
    const l = line('FL-BASE-RR-001');
    expect(l.materialCents).toBe(11077);
    expect(l.laborCents).toBe(17225);
  });

  it('prices wall paint off net wall area, not gross', () => {
    const l = line('PT-WALL-001');
    // 403.99 x 1.05 x $0.55 = $233.30 ; 403.99 x 0.011 hrs x $65 = $288.85
    expect(l.materialCents).toBe(23330);
    expect(l.laborCents).toBe(28885);
  });

  it('totals material + labor, then applies O&P on the sum', () => {
    const { totals } = est;
    expect(totals.materialCents).toBe(65472 + 11077 + 23330);
    expect(totals.laborCents).toBe(34944 + 17225 + 28885);
    expect(totals.subtotalCents).toBe(totals.materialCents + totals.laborCents);
    expect(totals.opCents).toBe(Math.round(totals.subtotalCents * 0.2));
    expect(totals.totalCents).toBe(totals.subtotalCents + totals.opCents);
  });

  it('sums labor hours across lines', () => {
    expect(est.totals.laborHours).toBeCloseTo(5.376 + 2.65 + 4.44389, 10);
  });

  it('derives the trust level from the space — measured room, measurement-backed', () => {
    expect(est.trustLevel).toBe('measurement-backed');
  });

  it('is deterministic — the same inputs produce a byte-identical estimate', () => {
    const again = buildEstimate(
      goldenRoom(),
      [{ code: 'FL-LVP-001' }, { code: 'FL-BASE-RR-001' }, { code: 'PT-WALL-001' }],
      book,
      baseConfig,
    );
    expect(JSON.stringify(again)).toBe(JSON.stringify(est));
  });
});

describe('ACCEPTANCE — provenance travels with every number', () => {
  const est = buildEstimate(goldenRoom(), [{ code: 'FL-LVP-001' }], book, baseConfig);

  it('every line carries qty, unit, qtySource, waste, source and effective date', () => {
    for (const l of est.lines) {
      expect(l.qty).toBeGreaterThan(0);
      expect(l.unit).toBe('SF');
      expect(l.qtySource).toBe('measured');
      expect(l.wasteFactor).toBe(0.1);
      expect(l.rateBookSource).toBe('seed-v0-placeholder');
      expect(l.effectiveDate).toBe('2026-08-08');
    }
  });

  it('collects the distinct pricing sources behind the estimate', () => {
    expect(est.pricingSources).toEqual([
      { source: 'seed-v0-placeholder', effectiveDate: '2026-08-08' },
    ]);
  });

  it('carries the assumptions and exclusions it was given, verbatim', () => {
    const withNotes = buildEstimate(goldenRoom(), [{ code: 'FL-LVP-001' }], book, {
      ...baseConfig,
      assumptions: ['Subfloor is flat and sound'],
      exclusions: ['Asbestos or lead abatement'],
    });
    expect(withNotes.assumptions).toEqual(['Subfloor is flat and sound']);
    expect(withNotes.exclusions).toEqual(['Asbestos or lead abatement']);
  });

  it('defaults assumptions and exclusions to empty, never to invented text', () => {
    expect(est.assumptions).toEqual([]);
    expect(est.exclusions).toEqual([]);
  });
});

describe('ACCEPTANCE — quantity overrides', () => {
  it('an override replaces the formula and flips qtySource to manual', () => {
    const est = buildEstimate(
      goldenRoom(),
      [{ code: 'FL-LVP-001', qtyOverride: 200 }],
      book,
      baseConfig,
    );
    const l = est.lines[0];
    expect(l?.qty).toBe(200);
    expect(l?.qtySource).toBe('manual');
    expect(l?.materialCents).toBe(Math.round(200 * 1.1 * 3.1 * 100));
  });

  it('a zero override is allowed and prices to zero', () => {
    const est = buildEstimate(
      goldenRoom(),
      [{ code: 'FL-LVP-001', qtyOverride: 0 }],
      book,
      baseConfig,
    );
    expect(est.totals.totalCents).toBe(0);
    expect(est.lines[0]?.qtySource).toBe('manual');
  });

  it('leaves other lines measured', () => {
    const est = buildEstimate(
      goldenRoom(),
      [{ code: 'FL-LVP-001', qtyOverride: 200 }, { code: 'PT-WALL-001' }],
      book,
      baseConfig,
    );
    expect(est.lines.map((l) => l.qtySource)).toEqual(['manual', 'measured']);
  });
});

describe('ACCEPTANCE — tiers', () => {
  const selections = [{ code: 'FL-LVP-001' }, { code: 'PT-WALL-001' }];
  const at = (tier: EstimateConfig['tier']) =>
    buildEstimate(goldenRoom(), selections, book, { ...baseConfig, tier });

  it('good < better < best', () => {
    expect(at('good').totals.totalCents).toBeLessThan(at('better').totals.totalCents);
    expect(at('better').totals.totalCents).toBeLessThan(at('best').totals.totalCents);
  });

  it('scales material only — labor hours are the same work whatever the finish', () => {
    const good = at('good');
    const best = at('best');
    expect(good.totals.laborCents).toBe(best.totals.laborCents);
    expect(good.totals.laborHours).toBe(best.totals.laborHours);
    expect(best.totals.materialCents).toBeGreaterThan(good.totals.materialCents);
  });

  it('records the multiplier that was applied on each line', () => {
    expect(at('best').lines[0]?.tierMultiplier).toBe(1.35);
    expect(at('best').lines[0]?.effectiveUnitCost).toBeCloseTo(3.1 * 1.35, 10);
  });
});

describe('ACCEPTANCE — O&P and money handling', () => {
  it('O&P of 0 leaves the subtotal untouched', () => {
    const est = buildEstimate(goldenRoom(), [{ code: 'FL-LVP-001' }], book, {
      ...baseConfig,
      opPct: 0,
    });
    expect(est.totals.opCents).toBe(0);
    expect(est.totals.totalCents).toBe(est.totals.subtotalCents);
  });

  it('every money field is an integer number of cents', () => {
    const est = buildEstimate(
      goldenRoom(),
      book.entries.map((e) => ({ code: e.code })),
      book,
      baseConfig,
    );
    for (const l of est.lines) {
      expect(Number.isInteger(l.materialCents)).toBe(true);
      expect(Number.isInteger(l.laborCents)).toBe(true);
    }
    for (const v of Object.values(est.totals)) {
      if (v !== est.totals.laborHours) expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('renders cents as dollars only at the display edge', () => {
    expect(centsToDollarString(0)).toBe('0.00');
    expect(centsToDollarString(5)).toBe('0.05');
    expect(centsToDollarString(65472)).toBe('654.72');
    expect(centsToDollarString(123456789)).toBe('1,234,567.89');
    expect(centsToDollarString(-2500)).toBe('-25.00');
  });
});

describe('REJECTION — the pricing stage refuses bad input', () => {
  it('refuses an unknown item code', () => {
    let caught: unknown;
    try {
      buildEstimate(goldenRoom(), [{ code: 'NOT-A-REAL-CODE' }], book, baseConfig);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EstimateError);
    expect((caught as EstimateError).code).toBe('UNKNOWN_ITEM_CODE');
    expect((caught as EstimateError).itemCode).toBe('NOT-A-REAL-CODE');
  });

  it('refuses an unknown code even when the other selections are fine', () => {
    expect(() =>
      buildEstimate(goldenRoom(), [{ code: 'FL-LVP-001' }, { code: 'GHOST' }], book, baseConfig),
    ).toThrow(EstimateError);
  });

  it('refuses an empty selection rather than returning a $0 estimate', () => {
    expect(() => buildEstimate(goldenRoom(), [], book, baseConfig)).toThrow(
      expect.objectContaining({ code: 'EMPTY_SELECTION' }),
    );
  });

  it('refuses the same item selected twice', () => {
    expect(() =>
      buildEstimate(
        goldenRoom(),
        [{ code: 'FL-LVP-001' }, { code: 'FL-LVP-001' }],
        book,
        baseConfig,
      ),
    ).toThrow(expect.objectContaining({ code: 'DUPLICATE_SELECTION' }));
  });

  it('refuses a negative or non-finite quantity override', () => {
    expect(() =>
      buildEstimate(goldenRoom(), [{ code: 'FL-LVP-001', qtyOverride: -5 }], book, baseConfig),
    ).toThrow(expect.objectContaining({ code: 'INVALID_QTY_OVERRIDE' }));
    expect(() =>
      buildEstimate(goldenRoom(), [{ code: 'FL-LVP-001', qtyOverride: NaN }], book, baseConfig),
    ).toThrow(expect.objectContaining({ code: 'INVALID_QTY_OVERRIDE' }));
  });

  it('refuses a negative labor rate', () => {
    expect(() =>
      buildEstimate(goldenRoom(), [{ code: 'FL-LVP-001' }], book, {
        ...baseConfig,
        laborRatePerHour: -65,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_LABOR_RATE' }));
  });

  it('refuses an O&P that is not a fraction — 20 is not 20%', () => {
    expect(() =>
      buildEstimate(goldenRoom(), [{ code: 'FL-LVP-001' }], book, { ...baseConfig, opPct: 20 }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_OP_PCT' }));
    expect(() =>
      buildEstimate(goldenRoom(), [{ code: 'FL-LVP-001' }], book, { ...baseConfig, opPct: -0.1 }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_OP_PCT' }));
  });

  it('refuses an unknown tier', () => {
    expect(() =>
      buildEstimate(goldenRoom(), [{ code: 'FL-LVP-001' }], book, {
        ...baseConfig,
        tier: 'platinum' as never,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TIER' }));
  });

  it('refuses bad geometry before it ever reaches a price', () => {
    expect(() =>
      buildEstimate(plainRoom({ width_ft: 0 }), [{ code: 'FL-LVP-001' }], book, baseConfig),
    ).toThrow(expect.objectContaining({ code: 'NON_POSITIVE_DIMENSION' }));
  });
});
