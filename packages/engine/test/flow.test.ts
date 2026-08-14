import { describe, expect, it } from 'vitest';

import seedJson from '../src/ratebook.seed.json';
import { loadRateBook } from '../src/ratebook';
import { approvedMockupRoom } from '../src/samples';
import { type Project, ProjectError, buildProjectEstimate } from '../src/project';
import { PLACEHOLDER_PRICING_NOTICE, buildProposal } from '../src/proposal';
import { parseProjects, serializeProjects } from '../src/persist';

const book = loadRateBook(seedJson);

/**
 * The four screens, walked end to end as data.
 *
 * Projects -> What are we building? -> Estimate -> Proposal, with a save/reload in the
 * middle, because that is the trip a real project takes. Everything the UI does to a
 * project between screens is done here in plain code.
 */

/** Screen 1: what "＋ New project" produces. Clock and id are inputs, as in the app. */
function newProject(): Project {
  return {
    id: 'pr-flow',
    name: 'Johnson Basement',
    client: '',
    address: '',
    createdAt: '2026-08-14',
    rooms: [{ id: 'room-1', space: approvedMockupRoom('Johnson Basement'), selections: [] }],
    config: {
      laborRatePerHour: 65,
      opPct: 0.2,
      tier: 'better',
      assumptions: ['Subfloor is flat, dry and structurally sound.'],
      exclusions: ['Permits and inspection fees.'],
    },
  };
}

/** A save/reload cycle, exactly as the browser store does it. */
function reload(project: Project): Project {
  const { projects, dropped } = parseProjects(serializeProjects([project]));
  expect(dropped).toEqual([]);
  const back = projects[0];
  if (!back) throw new Error('the project did not survive the round trip');
  return back;
}

describe('the four screens, end to end', () => {
  it('screen 1 -> a brand new project cannot be priced, and says why', () => {
    let caught: unknown;
    try {
      buildProjectEstimate(newProject(), book);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProjectError);
    expect((caught as ProjectError).code).toBe('NO_SCOPE');
  });

  it('screen 2 -> picking scope makes it priceable, on the golden numbers', () => {
    const p = newProject();
    p.rooms[0]!.selections = [
      { code: 'FL-LVP-001' },
      { code: 'FL-BASE-RR-001' },
      { code: 'PT-WALL-001' },
    ];

    const est = buildProjectEstimate(reload(p), book);
    const t = est.rooms[0]!.estimate.takeoff;

    expect(t.floorAreaSF).toBe(192);
    expect(t.grossWallAreaSF).toBe(448);
    expect(Math.round(t.netWallAreaSF)).toBe(404);
    expect(t.perimeterLF).toBe(53);
    expect(est.totals.totalCents).toBe(217120); // $2,171.20
    expect(est.trustLevel).toBe('measurement-backed');
  });

  it('screen 3 -> the tier the contractor picks survives a save and reload', () => {
    const p = newProject();
    p.rooms[0]!.selections = [{ code: 'FL-LVP-001' }];
    p.config.tier = 'best';

    const reloaded = reload(p);
    expect(reloaded.config.tier).toBe('best');
    expect(buildProjectEstimate(reloaded, book).tier).toBe('best');
    expect(buildProjectEstimate(reloaded, book).totals.totalCents).toBeGreaterThan(
      buildProjectEstimate({ ...reloaded, config: { ...reloaded.config, tier: 'good' } }, book)
        .totals.totalCents,
    );
  });

  it('screen 3 -> a manual override survives the round trip and stays marked manual', () => {
    const p = newProject();
    p.rooms[0]!.selections = [{ code: 'FL-LVP-001', qtyOverride: 250 }];

    const line = buildProjectEstimate(reload(p), book).rooms[0]!.estimate.lines[0]!;
    expect(line.qty).toBe(250);
    expect(line.qtySource).toBe('manual');
    expect(line.materialCents).toBe(Math.round(250 * 1.1 * 3.1 * 100));
  });

  it('screen 4 -> the proposal carries the notice, the sources and the derived label', () => {
    const p = newProject();
    p.client = 'Dana Johnson';
    p.address = '14 Elm St';
    p.rooms[0]!.selections = [{ code: 'FL-LVP-001' }, { code: 'PT-WALL-001' }];

    const proposal = buildProposal(reload(p), book, {
      preparedOn: '2026-08-14',
      pricingNotice: PLACEHOLDER_PRICING_NOTICE,
    });

    expect(proposal.pricingNotice).toMatch(/not market rates/i);
    expect(proposal.client).toBe('Dana Johnson');
    expect(proposal.trustLevel).toBe('measurement-backed');
    expect(proposal.pricingSources).toEqual([
      { source: 'seed-v0-placeholder', effectiveDate: '2026-08-08' },
    ]);
    expect(proposal.measurements[0]).toMatchObject({ floorAreaSF: 192, perimeterLF: 53 });
    expect(proposal.tiers.filter((t) => t.selected).map((t) => t.tier)).toEqual(['better']);
  });

  it('a room edited to manual on screen 2 shows as preliminary on screens 3 and 4', () => {
    const p = newProject();
    p.rooms[0]!.selections = [{ code: 'FL-LVP-001' }];
    p.rooms[0]!.space.dimensionSource = 'manual';

    const reloaded = reload(p);
    expect(buildProjectEstimate(reloaded, book).trustLevel).toBe('preliminary');

    const proposal = buildProposal(reloaded, book, {
      preparedOn: '2026-08-14',
      pricingNotice: PLACEHOLDER_PRICING_NOTICE,
    });
    expect(proposal.trustLevel).toBe('preliminary');
    expect(proposal.trustLadder.filter((r) => r.current).map((r) => r.rung)).toEqual([
      'preliminary',
    ]);
  });

  it('deleting the last room takes the project back to a refusal, not to $0', () => {
    const p = newProject();
    p.rooms[0]!.selections = [{ code: 'FL-LVP-001' }];
    p.rooms = [];

    expect(() => buildProjectEstimate(reload(p), book)).toThrow(
      expect.objectContaining({ code: 'NO_ROOMS' }),
    );
    expect(() =>
      buildProposal(reload(p), book, {
        preparedOn: '2026-08-14',
        pricingNotice: PLACEHOLDER_PRICING_NOTICE,
      }),
    ).toThrow(expect.objectContaining({ code: 'NO_ROOMS' }));
  });

  it('the whole flow is deterministic — same project, same cents, every time', () => {
    const p = newProject();
    p.rooms[0]!.selections = [{ code: 'FL-LVP-001' }, { code: 'PT-WALL-001' }];
    const once = buildProposal(reload(p), book, {
      preparedOn: '2026-08-14',
      pricingNotice: PLACEHOLDER_PRICING_NOTICE,
    });
    const twice = buildProposal(reload(p), book, {
      preparedOn: '2026-08-14',
      pricingNotice: PLACEHOLDER_PRICING_NOTICE,
    });
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});
