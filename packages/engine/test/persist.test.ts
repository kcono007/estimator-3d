import { describe, expect, it } from 'vitest';

import seedJson from '../src/ratebook.seed.json';
import { loadRateBook } from '../src/ratebook';
import { PROJECT_STORE_VERSION, parseProjects, readProject, serializeProjects } from '../src/persist';
import { type Project, buildProjectEstimate } from '../src/project';
import { goldenRoom } from './fixtures';

const book = loadRateBook(seedJson);

function project(): Project {
  return {
    id: 'pr-1',
    name: 'Johnson Basement',
    client: 'Dana Johnson',
    address: '14 Elm St',
    createdAt: '2026-08-14',
    config: {
      laborRatePerHour: 65,
      opPct: 0.2,
      tier: 'better',
      assumptions: ['Subfloor sound.'],
      exclusions: ['Permits.'],
    },
    rooms: [
      {
        id: 'room-1',
        space: goldenRoom(),
        selections: [{ code: 'FL-LVP-001' }, { code: 'PT-WALL-001', qtyOverride: 400 }],
      },
    ],
  };
}

describe('ACCEPTANCE — the store round-trips', () => {
  it('survives serialize -> parse unchanged', () => {
    const { projects, dropped } = parseProjects(serializeProjects([project()]));
    expect(dropped).toEqual([]);
    expect(projects).toEqual([project()]);
  });

  it('stamps a version so a future format can migrate rather than guess', () => {
    expect(JSON.parse(serializeProjects([])).version).toBe(PROJECT_STORE_VERSION);
  });

  it('a round-tripped project still prices to the same cents', () => {
    const before = buildProjectEstimate(project(), book);
    const after = buildProjectEstimate(parseProjects(serializeProjects([project()])).projects[0]!, book);
    expect(after.totals.totalCents).toBe(before.totals.totalCents);
  });

  it('keeps optional opening fields optional rather than filling them with zeros', () => {
    const door = parseProjects(serializeProjects([project()])).projects[0]?.rooms[0]?.space
      .openings[0];
    expect(door?.kind).toBe('door');
    expect('sill_ft' in (door ?? {})).toBe(false);
    expect(door?.offset_ft).toBe(2);
  });
});

describe('REJECTION — untrusted stored data cannot corrupt the engine', () => {
  it('returns an empty store for null, blank, or absent data', () => {
    expect(parseProjects(null)).toEqual({ projects: [], dropped: [] });
    expect(parseProjects(undefined)).toEqual({ projects: [], dropped: [] });
    expect(parseProjects('   ')).toEqual({ projects: [], dropped: [] });
  });

  it('does not brick on malformed JSON — it reports and carries on', () => {
    const r = parseProjects('{not json');
    expect(r.projects).toEqual([]);
    expect(r.dropped[0]?.reason).toContain('not valid JSON');
  });

  it('reports a store with no projects array', () => {
    const r = parseProjects('{"version":1}');
    expect(r.projects).toEqual([]);
    expect(r.dropped[0]?.reason).toContain('no projects array');
  });

  it('drops an id-less project loudly, keeping the good ones', () => {
    const raw = JSON.stringify({ version: 1, projects: [{ name: 'ghost' }, project()] });
    const r = parseProjects(raw);
    expect(r.projects.map((p) => p.id)).toEqual(['pr-1']);
    expect(r.dropped).toEqual([{ index: 0, reason: 'project has no id' }]);
  });

  it('falls back to safe defaults for a garbage config instead of pricing off nonsense', () => {
    const p = readProject({ id: 'x', config: { tier: 'platinum', opPct: 'lots' } });
    expect(p.config.tier).toBe('better');
    expect(p.config.opPct).toBe(0.2);
    expect(p.config.laborRatePerHour).toBe(65);
  });

  it('defaults an unrecognised dimension source to manual, never to measured', () => {
    const p = readProject({
      id: 'x',
      rooms: [{ id: 'r', space: { dimensionSource: 'laser-certified-trust-me' } }],
    });
    expect(p.rooms[0]?.space.dimensionSource).toBe('manual');
  });

  it('drops selections with no code rather than pricing a nameless line', () => {
    const p = readProject({
      id: 'x',
      rooms: [{ id: 'r', selections: [{ code: 'FL-LVP-001' }, { qtyOverride: 5 }, { code: '  ' }] }],
    });
    expect(p.rooms[0]?.selections).toEqual([{ code: 'FL-LVP-001' }]);
  });
});

describe('REJECTION — the UI layer cannot set a trust label', () => {
  it('strips trustLevel off a stored project', () => {
    const stored = {
      ...project(),
      trustLevel: 'contract-ready',
    };
    const parsed = readProject(stored);
    expect('trustLevel' in parsed).toBe(false);
  });

  it('strips trustLevel off a stored room and space', () => {
    const parsed = readProject({
      id: 'x',
      rooms: [
        {
          id: 'r',
          trustLevel: 'field-verified',
          space: { trustLevel: 'contract-ready', dimensionSource: 'manual' },
          selections: [],
        },
      ],
    });
    const room = parsed.rooms[0];
    expect('trustLevel' in (room ?? {})).toBe(false);
    expect('trustLevel' in (room?.space ?? {})).toBe(false);
  });

  it('a hand-edited store claiming contract-ready still derives preliminary', () => {
    const tampered = JSON.stringify({
      version: 1,
      projects: [
        {
          ...project(),
          trustLevel: 'contract-ready',
          rooms: [
            {
              id: 'room-1',
              trustLevel: 'contract-ready',
              space: { ...goldenRoom(), dimensionSource: 'manual' },
              selections: [{ code: 'FL-LVP-001' }],
            },
          ],
        },
      ],
    });
    const parsed = parseProjects(tampered).projects[0];
    if (!parsed) throw new Error('expected the project to survive parsing');
    expect(buildProjectEstimate(parsed, book).trustLevel).toBe('preliminary');
  });

  it('and a store claiming measurement-backed on measured dimensions is right only by derivation', () => {
    const parsed = parseProjects(serializeProjects([project()])).projects[0];
    if (!parsed) throw new Error('expected the project to survive parsing');
    expect(buildProjectEstimate(parsed, book).trustLevel).toBe('measurement-backed');
  });
});
