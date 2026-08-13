'use client';

import { useState } from 'react';

import type { DimSource, OpeningKind, WallId } from '@estimator3d/engine';

import type { FormState, OpeningRow } from './params';

/**
 * The form, and only the form. It collects inputs and submits them as a GET query — it
 * computes no quantity and no price. Everything numeric on this page comes back from the
 * engine on the server.
 */

export interface CatalogEntry {
  code: string;
  trade: string;
  name: string;
  unit: string;
  basisLabel: string;
  wasteFactor: number;
}

const KINDS: OpeningKind[] = ['door', 'window', 'opening'];
const WALLS: WallId[] = ['N', 'S', 'E', 'W'];
const SOURCES: DimSource[] = ['measured', 'manual', 'inferred'];

function blankOpening(): OpeningRow {
  return {
    kind: 'window',
    wall: 'N',
    width_ft: '3',
    height_ft: '4',
    sill_ft: '3',
    offset_ft: '',
    dimensionSource: 'manual',
  };
}

export default function EstimateForm({
  initial,
  catalog,
}: {
  initial: FormState;
  catalog: CatalogEntry[];
}) {
  const [openings, setOpenings] = useState<OpeningRow[]>(initial.openings);

  const trades = catalog.reduce<Record<string, CatalogEntry[]>>((acc, e) => {
    (acc[e.trade] ??= []).push(e);
    return acc;
  }, {});

  return (
    <form method="get" action="/">
      <div className="card">
        <h2>Room</h2>
        <div className="row">
          <div>
            <label htmlFor="name">Space name</label>
            <input id="name" type="text" name="name" defaultValue={initial.name} />
          </div>
        </div>
        <div className="row c3">
          <div>
            <label htmlFor="w">Width (ft)</label>
            <input id="w" type="number" step="any" name="w" defaultValue={initial.width_ft} />
          </div>
          <div>
            <label htmlFor="d">Depth (ft)</label>
            <input id="d" type="number" step="any" name="d" defaultValue={initial.depth_ft} />
          </div>
          <div>
            <label htmlFor="h">Height (ft)</label>
            <input id="h" type="number" step="any" name="h" defaultValue={initial.height_ft} />
          </div>
        </div>
        <div className="row">
          <div>
            <label htmlFor="src">Dimension source (drives the trust label)</label>
            <select id="src" name="src" defaultValue={initial.dimensionSource}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Openings</h2>
        <div className="openings">
          {openings.map((o, i) => (
            <div className="opening" key={i}>
              <button
                type="button"
                className="del"
                aria-label={`Remove opening ${i + 1}`}
                onClick={() => setOpenings(openings.filter((_, j) => j !== i))}
              >
                ×
              </button>
              <div>
                <label>Kind</label>
                <select name="op_kind" defaultValue={o.kind}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Wall</label>
                <select name="op_wall" defaultValue={o.wall}>
                  {WALLS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Source</label>
                <select name="op_src" defaultValue={o.dimensionSource}>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Width ft</label>
                <input type="number" step="any" name="op_w" defaultValue={o.width_ft} />
              </div>
              <div>
                <label>Height ft</label>
                <input type="number" step="any" name="op_h" defaultValue={o.height_ft} />
              </div>
              <div>
                <label>Sill ft</label>
                <input type="number" step="any" name="op_sill" defaultValue={o.sill_ft} />
              </div>
              <div>
                <label>Offset ft (from wall start)</label>
                <input type="number" step="any" name="op_off" defaultValue={o.offset_ft} />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 10 }}
          onClick={() => setOpenings([...openings, blankOpening()])}
        >
          + Add opening
        </button>
      </div>

      <div className="card">
        <h2>Scope</h2>
        {Object.entries(trades).map(([trade, entries]) => (
          <div key={trade}>
            <h3>{trade}</h3>
            <div className="items">
              {entries.map((e) => (
                <label className="item" key={e.code} htmlFor={`sel-${e.code}`}>
                  <input
                    id={`sel-${e.code}`}
                    type="checkbox"
                    name="sel"
                    value={e.code}
                    defaultChecked={initial.selected.includes(e.code)}
                  />
                  <div>
                    <b>{e.name}</b>
                    <span>
                      {e.code} · {e.unit} from {e.basisLabel} · waste{' '}
                      {Math.round(e.wasteFactor * 100)}%
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    name={`qty_${e.code}`}
                    placeholder="qty"
                    title="Override the measured quantity — the line is then marked manual"
                    defaultValue={initial.overrides[e.code] ?? ''}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Pricing</h2>
        <div className="row c3">
          <div>
            <label htmlFor="rate">Labor $/hr</label>
            <input
              id="rate"
              type="number"
              step="any"
              name="rate"
              defaultValue={initial.laborRatePerHour}
            />
          </div>
          <div>
            <label htmlFor="op">O&amp;P %</label>
            <input id="op" type="number" step="any" name="op" defaultValue={initial.opPctDisplay} />
          </div>
          <div>
            <label htmlFor="tier">Tier</label>
            <select id="tier" name="tier" defaultValue={initial.tier}>
              <option value="good">Good</option>
              <option value="better">Better</option>
              <option value="best">Best</option>
            </select>
          </div>
        </div>
        <div className="row">
          <div>
            <label htmlFor="assume">Assumptions (one per line)</label>
            <textarea id="assume" name="assume" defaultValue={initial.assumptions} />
          </div>
          <div>
            <label htmlFor="exclude">Exclusions (one per line)</label>
            <textarea id="exclude" name="exclude" defaultValue={initial.exclusions} />
          </div>
        </div>
        <button type="submit" className="btn">
          Calculate estimate
        </button>
      </div>
    </form>
  );
}
