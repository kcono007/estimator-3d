import { describe, expect, it } from 'vitest';

import { deriveTrustLevel, wallLengthFt } from '../src/roomgraph';
import {
  ceilingAreaSF,
  countsByKind,
  floorAreaSF,
  grossWallAreaSF,
  netWallAreaSF,
  perimeterLF,
  takeoff,
} from '../src/takeoff';
import { goldenRoom, opening, plainRoom } from './fixtures';

describe('takeoff formulas', () => {
  it('floor and ceiling are width x depth', () => {
    const s = plainRoom({ width_ft: 12, depth_ft: 9 });
    expect(floorAreaSF(s)).toBe(108);
    expect(ceilingAreaSF(s)).toBe(108);
  });

  it('gross wall is perimeter x height', () => {
    expect(grossWallAreaSF(plainRoom({ width_ft: 10, depth_ft: 10, height_ft: 8 }))).toBe(320);
  });

  it('net wall subtracts every opening, whatever its kind', () => {
    const s = plainRoom({
      openings: [
        opening({ id: 'a', kind: 'window', wall: 'N', width_ft: 4, height_ft: 3 }),
        opening({ id: 'b', kind: 'door', wall: 'S', width_ft: 3, height_ft: 7 }),
        opening({ id: 'c', kind: 'opening', wall: 'E', width_ft: 5, height_ft: 7 }),
      ],
    });
    expect(netWallAreaSF(s)).toBe(320 - (12 + 21 + 35));
  });

  it('perimeter subtracts door widths only — windows do not interrupt baseboard', () => {
    const s = plainRoom({
      openings: [
        opening({ id: 'a', kind: 'window', wall: 'N', width_ft: 4, height_ft: 3 }),
        opening({ id: 'b', kind: 'door', wall: 'S', width_ft: 3, height_ft: 7 }),
        opening({ id: 'c', kind: 'door', wall: 'W', width_ft: 2.5, height_ft: 7 }),
      ],
    });
    expect(perimeterLF(s)).toBe(40 - 5.5);
  });

  it('counts every opening kind, zero included', () => {
    expect(countsByKind(plainRoom())).toEqual({ door: 0, window: 0, opening: 0 });
  });

  it('N/S walls span the width, E/W walls span the depth', () => {
    const s = plainRoom({ width_ft: 16, depth_ft: 12 });
    expect(wallLengthFt(s, 'N')).toBe(16);
    expect(wallLengthFt(s, 'S')).toBe(16);
    expect(wallLengthFt(s, 'E')).toBe(12);
    expect(wallLengthFt(s, 'W')).toBe(12);
  });

  it('takeoff() bundles every quantity in one pass', () => {
    const t = takeoff(goldenRoom());
    expect(Object.keys(t).sort()).toEqual(
      [
        'ceilingAreaSF',
        'countsByKind',
        'floorAreaSF',
        'grossPerimeterLF',
        'grossWallAreaSF',
        'netWallAreaSF',
        'openingAreaSF',
        'perimeterLF',
      ].sort(),
    );
  });

  it('is deterministic — same space in, identical numbers out', () => {
    expect(takeoff(goldenRoom())).toEqual(takeoff(goldenRoom()));
  });
});

describe('trust level is derived, never assigned', () => {
  it('all measured -> measurement-backed', () => {
    expect(deriveTrustLevel(goldenRoom())).toBe('measurement-backed');
  });

  it('a manual space dimension drags it to preliminary', () => {
    expect(deriveTrustLevel(plainRoom({ dimensionSource: 'manual' }))).toBe('preliminary');
  });

  it('a single inferred opening drags an otherwise measured room to preliminary', () => {
    const s = goldenRoom();
    const first = s.openings[0];
    if (!first) throw new Error('fixture lost its openings');
    first.dimensionSource = 'inferred';
    expect(deriveTrustLevel(s)).toBe('preliminary');
  });
});
