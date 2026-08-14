import { describe, expect, it } from 'vitest';

import seedJson from '../src/ratebook.seed.json';
import { EstimateError, type EstimateConfig } from '../src/estimate';
import { loadRateBook } from '../src/ratebook';
import {
  type Project,
  ProjectError,
  buildProjectEstimate,
  deriveProjectTrustLevel,
  tierTotals,
} from '../src/project';
import { goldenRoom, plainRoom } from './fixtures';

const book = loadRateBook(seedJson);

const config: EstimateConfig = { laborRatePerHour: 65, opPct: 0.2, tier: 'better' };

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
        selections: [{ code: 'FL-LVP-001' }, { code: 'FL-BASE-RR-001' }, { code: 'PT-WALL-001' }],
      },
    ],
    ...overrides,
  };
}

describe('REJECTION — a project that cannot be priced says so', () => {
  it('refuses a project with no rooms rather than returning $0', () => {
    let caught: unknown;
    try {
      buildProjectEstimate(project({ rooms: [] }), book);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProjectError);
    expect((caught as ProjectError).code).toBe('NO_ROOMS');
    expect((caught as ProjectError).message).toContain('no rooms');
  });

  it('refuses a project whose rooms are all unscoped — $0 would look like an answer', () => {
    const p = project();
    const room = p.rooms[0];
    if (!room) throw new Error('fixture lost its room');
    room.selections = [];
    expect(() => buildProjectEstimate(p, book)).toThrow(
      expect.objectContaining({ code: 'NO_SCOPE' }),
    );
  });

  it('still refuses an unknown item code at the project level', () => {
    const p = project();
    const room = p.rooms[0];
    if (!room) throw new Error('fixture lost its room');
    room.selections = [{ code: 'NOT-A-CODE' }];
    let caught: unknown;
    try {
      buildProjectEstimate(p, book);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EstimateError);
    expect((caught as EstimateError).code).toBe('UNKNOWN_ITEM_CODE');
  });

  it('refuses duplicate room ids', () => {
    const p = project();
    const room = p.rooms[0];
    if (!room) throw new Error('fixture lost its room');
    p.rooms = [room, { ...room }];
    expect(() => buildProjectEstimate(p, book)).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_ROOM_ID' }),
    );
  });

  it('refuses a project with no id or a createdAt that is not a date', () => {
    expect(() => buildProjectEstimate(project({ id: '  ' }), book)).toThrow(
      expect.objectContaining({ code: 'INVALID_PROJECT_ID' }),
    );
    expect(() => buildProjectEstimate(project({ createdAt: 'yesterday' }), book)).toThrow(
      expect.objectContaining({ code: 'INVALID_CREATED_AT' }),
    );
  });

  it('refuses bad geometry through the project layer too', () => {
    const p = project({
      rooms: [
        { id: 'room-1', space: plainRoom({ width_ft: 0 }), selections: [{ code: 'FL-LVP-001' }] },
      ],
    });
    expect(() => buildProjectEstimate(p, book)).toThrow(
      expect.objectContaining({ code: 'NON_POSITIVE_DIMENSION' }),
    );
  });
});

describe('ACCEPTANCE — a project prices its rooms and sums them', () => {
  it('matches the single-room estimate for a one-room project', () => {
    const est = buildProjectEstimate(project(), book);
    expect(est.rooms).toHaveLength(1);
    expect(est.totals.totalCents).toBe(est.rooms[0]?.estimate.totals.totalCents);
    // The golden room at better/65/20% — locked in estimate.test.ts, restated here.
    expect(est.totals.totalCents).toBe(217120);
  });

  it('sums two rooms', () => {
    const p = project();
    const room = p.rooms[0];
    if (!room) throw new Error('fixture lost its room');
    p.rooms = [
      room,
      {
        id: 'room-2',
        space: { ...plainRoom({ id: 'sp-2', name: 'Hall' }) },
        selections: [{ code: 'FL-LVP-001' }],
      },
    ];
    const est = buildProjectEstimate(p, book);
    expect(est.rooms).toHaveLength(2);
    const [a, b] = est.rooms;
    expect(est.totals.totalCents).toBe(
      (a?.estimate.totals.totalCents ?? 0) + (b?.estimate.totals.totalCents ?? 0),
    );
  });

  it('prices scoped rooms and reports unscoped ones instead of hiding them', () => {
    const p = project();
    const room = p.rooms[0];
    if (!room) throw new Error('fixture lost its room');
    p.rooms = [
      room,
      { id: 'room-2', space: plainRoom({ id: 'sp-2', name: 'Hall' }), selections: [] },
    ];
    const est = buildProjectEstimate(p, book);
    expect(est.rooms).toHaveLength(1);
    expect(est.unscopedRoomIds).toEqual(['room-2']);
  });

  it('collects pricing sources across rooms without duplicating them', () => {
    expect(buildProjectEstimate(project(), book).pricingSources).toEqual([
      { source: 'seed-v0-placeholder', effectiveDate: '2026-08-08' },
    ]);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildProjectEstimate(project(), book))).toBe(
      JSON.stringify(buildProjectEstimate(project(), book)),
    );
  });

  it('offers a total at every tier, good < better < best', () => {
    const totals = tierTotals(project(), book);
    expect(totals.map((t) => t.tier)).toEqual(['good', 'better', 'best']);
    const [good, better, best] = totals;
    expect(good?.totalCents).toBeLessThan(better?.totalCents ?? 0);
    expect(better?.totalCents).toBeLessThan(best?.totalCents ?? 0);
  });

  it('reports a null tier total rather than throwing when the project refuses', () => {
    expect(tierTotals(project({ rooms: [] }), book)).toEqual([
      { tier: 'good', totalCents: null },
      { tier: 'better', totalCents: null },
      { tier: 'best', totalCents: null },
    ]);
  });
});

describe('trust level is derived at the project level too', () => {
  it('all-measured rooms give measurement-backed', () => {
    expect(buildProjectEstimate(project(), book).trustLevel).toBe('measurement-backed');
  });

  it('one manual room drags the whole project to preliminary — weakest link wins', () => {
    const p = project();
    p.rooms = [
      { id: 'room-1', space: goldenRoom(), selections: [{ code: 'FL-LVP-001' }] },
      {
        id: 'room-2',
        space: plainRoom({ id: 'sp-2', name: 'Hall', dimensionSource: 'manual' }),
        selections: [{ code: 'FL-LVP-001' }],
      },
    ];
    expect(buildProjectEstimate(p, book).trustLevel).toBe('preliminary');
  });

  it('an UNSCOPED manual room still drags the project down — it is not priced, but it counts', () => {
    const p = project();
    const room = p.rooms[0];
    if (!room) throw new Error('fixture lost its room');
    p.rooms = [
      room,
      {
        id: 'room-2',
        space: plainRoom({ id: 'sp-2', dimensionSource: 'inferred' }),
        selections: [],
      },
    ];
    const est = buildProjectEstimate(p, book);
    expect(est.rooms).toHaveLength(1);
    expect(est.trustLevel).toBe('preliminary');
  });

  it('an empty room list is preliminary, never measurement-backed by vacuous truth', () => {
    expect(deriveProjectTrustLevel([])).toBe('preliminary');
  });

  it('cannot be assigned — a trustLevel smuggled onto the project is ignored', () => {
    const p = project();
    const room = p.rooms[0];
    if (!room) throw new Error('fixture lost its room');
    room.space.dimensionSource = 'manual';
    const smuggled = {
      ...p,
      trustLevel: 'measurement-backed',
      rooms: p.rooms.map((r) => ({ ...r, trustLevel: 'contract-ready' })),
    } as unknown as Project;
    expect(buildProjectEstimate(smuggled, book).trustLevel).toBe('preliminary');
  });
});
