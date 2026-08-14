import { describe, expect, it } from 'vitest';

import seedJson from '../src/ratebook.seed.json';
import type { EstimateConfig } from '../src/estimate';
import { loadRateBook } from '../src/ratebook';
import type { Project } from '../src/project';
import {
  PLACEHOLDER_PRICING_NOTICE,
  ProposalError,
  TRUST_LADDER,
  buildProposal,
} from '../src/proposal';
import { goldenRoom, plainRoom } from './fixtures';

const book = loadRateBook(seedJson);

const config: EstimateConfig = {
  laborRatePerHour: 65,
  opPct: 0.2,
  tier: 'better',
  assumptions: ['Subfloor is flat, dry and sound.'],
  exclusions: ['Permits and inspection fees.'],
};

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'pr-1',
    name: 'Johnson Basement',
    client: 'Dana Johnson',
    address: '14 Elm St',
    createdAt: '2026-08-14',
    config,
    rooms: [
      {
        id: 'room-1',
        space: goldenRoom(),
        selections: [{ code: 'FL-LVP-001' }, { code: 'PT-WALL-001' }],
      },
    ],
    ...overrides,
  };
}

const ok = { preparedOn: '2026-08-14', pricingNotice: PLACEHOLDER_PRICING_NOTICE };

describe('REJECTION — a proposal will not render without the placeholder-pricing notice', () => {
  it('refuses when the notice is missing entirely', () => {
    let caught: unknown;
    try {
      buildProposal(project(), book, { preparedOn: '2026-08-14' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProposalError);
    expect((caught as ProposalError).code).toBe('PRICING_NOTICE_REQUIRED');
  });

  it('refuses a blank or whitespace notice', () => {
    for (const pricingNotice of ['', '   ', '\n\t']) {
      expect(() => buildProposal(project(), book, { preparedOn: '2026-08-14', pricingNotice })).toThrow(
        expect.objectContaining({ code: 'PRICING_NOTICE_REQUIRED' }),
      );
    }
  });

  it('refuses a notice that does not actually warn — a notice that does not warn is not a notice', () => {
    expect(() =>
      buildProposal(project(), book, {
        preparedOn: '2026-08-14',
        pricingNotice: 'Prices subject to change.',
      }),
    ).toThrow(expect.objectContaining({ code: 'PRICING_NOTICE_INADEQUATE' }));

    expect(() =>
      buildProposal(project(), book, {
        preparedOn: '2026-08-14',
        pricingNotice: 'Our best market rates, guaranteed.',
      }),
    ).toThrow(expect.objectContaining({ code: 'PRICING_NOTICE_INADEQUATE' }));
  });

  it('accepts any wording that does say the numbers are not market rates', () => {
    expect(() =>
      buildProposal(project(), book, {
        preparedOn: '2026-08-14',
        pricingNotice: 'Seed figures only — these are NOT MARKET RATES.',
      }),
    ).not.toThrow();
  });

  it('refuses the notice BEFORE it prices anything — no work on a proposal that cannot ship', () => {
    // Bad geometry would throw GeometryError if pricing ran first. The notice check wins.
    const p = project({
      rooms: [
        { id: 'room-1', space: plainRoom({ width_ft: -5 }), selections: [{ code: 'FL-LVP-001' }] },
      ],
    });
    expect(() => buildProposal(p, book, { preparedOn: '2026-08-14' })).toThrow(
      expect.objectContaining({ code: 'PRICING_NOTICE_REQUIRED' }),
    );
  });

  it('still refuses a project with no rooms, notice or not', () => {
    expect(() => buildProposal(project({ rooms: [] }), book, ok)).toThrow(
      expect.objectContaining({ code: 'NO_ROOMS' }),
    );
  });
});

describe('ACCEPTANCE — the proposal the mock shows', () => {
  const p = buildProposal(project(), book, ok);

  it('carries the notice on its face', () => {
    expect(p.pricingNotice).toBe(PLACEHOLDER_PRICING_NOTICE);
    expect(p.pricingNotice).toMatch(/not market rates/i);
  });

  it('names the pricing source and its effective date', () => {
    expect(p.pricingSources).toEqual([
      { source: 'seed-v0-placeholder', effectiveDate: '2026-08-08' },
    ]);
  });

  it('shows Good/Better/Best with the chosen tier marked', () => {
    expect(p.tiers.map((t) => t.tier)).toEqual(['good', 'better', 'best']);
    expect(p.tiers.filter((t) => t.selected).map((t) => t.tier)).toEqual(['better']);
    expect(p.totalCents).toBe(p.tiers.find((t) => t.tier === 'better')?.totalCents);
  });

  it('lists the scope with each line naming its quantity source', () => {
    expect(p.scope).toHaveLength(2);
    expect(p.scope[0]).toMatchObject({
      roomName: 'Johnson Basement',
      name: 'LVP flooring, installed',
      qtyLabel: '192 SF',
      qtySource: 'measured',
    });
  });

  it('restates the golden measurements for the client', () => {
    expect(p.measurements).toEqual([
      {
        roomName: 'Johnson Basement',
        dimensions: '16 × 12 × 8 ft',
        floorAreaSF: 192,
        netWallAreaSF: 403.99,
        perimeterLF: 53,
        doors: 1,
        windows: 2,
      },
    ]);
  });

  it('carries assumptions and exclusions through untouched', () => {
    expect(p.assumptions).toEqual(['Subfloor is flat, dry and sound.']);
    expect(p.exclusions).toEqual(['Permits and inspection fees.']);
  });

  it('uses the preparedOn it was handed — it never asks what day it is', () => {
    expect(p.preparedOn).toBe('2026-08-14');
    expect(buildProposal(project(), book, { ...ok, preparedOn: '2027-01-01' }).preparedOn).toBe(
      '2027-01-01',
    );
  });
});

describe('the trust ladder is shown in full, and only the derived rung is lit', () => {
  it('has all four rungs in order', () => {
    expect(TRUST_LADDER).toEqual([
      'preliminary',
      'measurement-backed',
      'field-verified',
      'contract-ready',
    ]);
  });

  it('lights exactly one rung, the derived one', () => {
    const p = buildProposal(project(), book, ok);
    expect(p.trustLevel).toBe('measurement-backed');
    expect(p.trustLadder.filter((r) => r.current).map((r) => r.rung)).toEqual([
      'measurement-backed',
    ]);
  });

  it('marks the two rungs M1 cannot reach as unavailable rather than hiding them', () => {
    const p = buildProposal(project(), book, ok);
    expect(p.trustLadder.filter((r) => r.unavailableInM1).map((r) => r.rung)).toEqual([
      'field-verified',
      'contract-ready',
    ]);
    // Nothing unavailable is ever current.
    expect(p.trustLadder.every((r) => !(r.current && r.unavailableInM1))).toBe(true);
  });

  it('drops to preliminary when a dimension is manual, and cannot be talked out of it', () => {
    const proj = project();
    const room = proj.rooms[0];
    if (!room) throw new Error('fixture lost its room');
    room.space.dimensionSource = 'manual';
    const smuggled = { ...proj, trustLevel: 'contract-ready' } as unknown as Project;
    const p = buildProposal(smuggled, book, ok);
    expect(p.trustLevel).toBe('preliminary');
    expect(p.trustLadder.filter((r) => r.current).map((r) => r.rung)).toEqual(['preliminary']);
  });
});
