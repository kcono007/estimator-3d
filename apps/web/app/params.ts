import type {
  DimSource,
  EstimateConfig,
  OpeningKind,
  Selection,
  Space,
  Tier,
  WallId,
} from '@estimator3d/engine';
import { isDimSource, isOpeningKind, isWallId } from '@estimator3d/engine';

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The form round-trips through the URL, so a link IS the estimate. This module turns
 * query strings into engine inputs and nothing more — it never computes a quantity or a
 * price. Bad values are passed through to the engine, which is the thing that refuses.
 */

function many(params: SearchParams, key: string): string[] {
  const v = params[key];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function one(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Parses a number, or returns the fallback. Never throws — the engine judges the value. */
function num(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isNaN(n) ? fallback : n;
}

/** Parses an optional number. Blank means "not stated", not zero. */
function optionalNum(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

export interface OpeningRow {
  kind: OpeningKind;
  wall: WallId;
  width_ft: string;
  height_ft: string;
  sill_ft: string;
  offset_ft: string;
  dimensionSource: DimSource;
}

/** The approved mockup's room, used when the page is opened with no query at all. */
export const DEFAULT_OPENINGS: OpeningRow[] = [
  {
    kind: 'door',
    wall: 'S',
    width_ft: '3',
    height_ft: '6.67',
    sill_ft: '',
    offset_ft: '2',
    dimensionSource: 'measured',
  },
  {
    kind: 'window',
    wall: 'N',
    width_ft: '4',
    height_ft: '3',
    sill_ft: '3.5',
    offset_ft: '3',
    dimensionSource: 'measured',
  },
  {
    kind: 'window',
    wall: 'E',
    width_ft: '4',
    height_ft: '3',
    sill_ft: '3.5',
    offset_ft: '4',
    dimensionSource: 'measured',
  },
];

export const DEFAULT_SELECTED = ['FL-LVP-001', 'FL-BASE-RR-001', 'PT-WALL-001'];

export const DEFAULT_ASSUMPTIONS = [
  'Subfloor is flat, dry and structurally sound.',
  'Work performed in a single mobilization during normal hours.',
  'Room is empty of furniture at start of work.',
];

export const DEFAULT_EXCLUSIONS = [
  'Asbestos, lead or mould abatement.',
  'Structural, electrical, plumbing and HVAC work.',
  'Permits and inspection fees.',
];

/** Everything the form needs to re-render itself exactly as submitted. */
export interface FormState {
  name: string;
  width_ft: string;
  depth_ft: string;
  height_ft: string;
  dimensionSource: DimSource;
  openings: OpeningRow[];
  selected: string[];
  overrides: Record<string, string>;
  laborRatePerHour: string;
  opPctDisplay: string;
  tier: Tier;
  assumptions: string;
  exclusions: string;
}

export function parseFormState(params: SearchParams): FormState {
  const pristine = Object.keys(params).length === 0;

  const kinds = many(params, 'op_kind');
  const openings: OpeningRow[] = pristine
    ? DEFAULT_OPENINGS.map((o) => ({ ...o }))
    : kinds.map((kind, i) => ({
        kind: isOpeningKind(kind) ? kind : 'window',
        wall: (() => {
          const w = many(params, 'op_wall')[i];
          return isWallId(w) ? w : 'N';
        })(),
        width_ft: many(params, 'op_w')[i] ?? '',
        height_ft: many(params, 'op_h')[i] ?? '',
        sill_ft: many(params, 'op_sill')[i] ?? '',
        offset_ft: many(params, 'op_off')[i] ?? '',
        dimensionSource: (() => {
          const s = many(params, 'op_src')[i];
          return isDimSource(s) ? s : 'manual';
        })(),
      }));

  const spaceSource = one(params, 'src');
  const tierRaw = one(params, 'tier');

  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith('qty_') && typeof value === 'string' && value.trim() !== '') {
      overrides[key.slice(4)] = value;
    }
  }

  return {
    name: one(params, 'name') ?? 'Johnson Basement',
    width_ft: one(params, 'w') ?? '16',
    depth_ft: one(params, 'd') ?? '12',
    height_ft: one(params, 'h') ?? '8',
    dimensionSource: isDimSource(spaceSource) ? spaceSource : 'measured',
    openings,
    selected: pristine ? [...DEFAULT_SELECTED] : many(params, 'sel'),
    overrides,
    laborRatePerHour: one(params, 'rate') ?? '65',
    opPctDisplay: one(params, 'op') ?? '20',
    tier: tierRaw === 'good' || tierRaw === 'better' || tierRaw === 'best' ? tierRaw : 'better',
    assumptions: one(params, 'assume') ?? DEFAULT_ASSUMPTIONS.join('\n'),
    exclusions: one(params, 'exclude') ?? DEFAULT_EXCLUSIONS.join('\n'),
  };
}

export function toSpace(form: FormState): Space {
  return {
    id: 'sp-web-1',
    name: form.name.trim() === '' ? 'Untitled Space' : form.name,
    width_ft: num(form.width_ft, NaN),
    depth_ft: num(form.depth_ft, NaN),
    height_ft: num(form.height_ft, NaN),
    dimensionSource: form.dimensionSource,
    openings: form.openings.map((o, i) => {
      const sill = optionalNum(o.sill_ft);
      const offset = optionalNum(o.offset_ft);
      return {
        id: `op-${i + 1}`,
        kind: o.kind,
        wall: o.wall,
        width_ft: num(o.width_ft, NaN),
        height_ft: num(o.height_ft, NaN),
        dimensionSource: o.dimensionSource,
        ...(sill !== undefined ? { sill_ft: sill } : {}),
        ...(offset !== undefined ? { offset_ft: offset } : {}),
      };
    }),
  };
}

export function toSelections(form: FormState): Selection[] {
  return form.selected.map((code) => {
    const raw = form.overrides[code];
    const override = optionalNum(raw);
    return override !== undefined ? { code, qtyOverride: override } : { code };
  });
}

export function toConfig(form: FormState): EstimateConfig {
  const lines = (text: string): string[] =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

  return {
    laborRatePerHour: num(form.laborRatePerHour, NaN),
    // The field is a percentage for humans; the engine wants a fraction.
    opPct: num(form.opPctDisplay, NaN) / 100,
    tier: form.tier,
    assumptions: lines(form.assumptions),
    exclusions: lines(form.exclusions),
  };
}
