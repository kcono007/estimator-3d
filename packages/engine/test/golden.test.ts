import { describe, expect, it } from 'vitest';

import { deriveTrustLevel } from '../src/roomgraph';
import { takeoff } from '../src/takeoff';
import { approvedMockupRoom } from '../src/samples';
import { goldenRoom } from './fixtures';

/**
 * GATE 3 — the 16 x 12 x 8 room must yield the same numbers the approved mockup shows:
 * floor 192 SF, net wall 404 SF (rounded), perimeter 53 LF.
 */
describe('GATE 3 — golden room matches the approved mockup', () => {
  const t = takeoff(goldenRoom());

  it('floor area is 192 SF', () => {
    expect(t.floorAreaSF).toBe(192);
  });

  it('net wall area rounds to 404 SF', () => {
    // 2*(16+12)*8 = 448 gross, less (3 x 6.67) + (4 x 3) + (4 x 3) = 44.01 of openings.
    expect(Math.round(t.netWallAreaSF)).toBe(404);
    expect(t.grossWallAreaSF).toBe(448);
    expect(t.openingAreaSF).toBeCloseTo(44.01, 10);
    expect(t.netWallAreaSF).toBeCloseTo(403.99, 10);
  });

  it('perimeter is 53 LF, net of the door', () => {
    expect(t.grossPerimeterLF).toBe(56);
    expect(t.perimeterLF).toBe(53);
  });

  it('ceiling area is 192 SF and counts are 1 door / 2 windows', () => {
    expect(t.ceilingAreaSF).toBe(192);
    expect(t.countsByKind).toEqual({ door: 1, window: 2, opening: 0 });
  });

  it('an all-measured room derives measurement-backed trust', () => {
    expect(deriveTrustLevel(goldenRoom())).toBe('measurement-backed');
  });
});

/**
 * The same gate, applied to the sample the WEB APP seeds. The UI imports this exact
 * function, so it cannot drift from the approved mockup without failing here.
 */
describe('GATE 3 — the shared sample room is the golden room', () => {
  const t = takeoff(approvedMockupRoom());

  it('produces the approved numbers', () => {
    expect(t.floorAreaSF).toBe(192);
    expect(t.grossWallAreaSF).toBe(448);
    expect(Math.round(t.netWallAreaSF)).toBe(404);
    expect(t.perimeterLF).toBe(53);
    expect(t.countsByKind).toEqual({ door: 1, window: 2, opening: 0 });
  });

  it('is identical to the test fixture, field for field', () => {
    expect(approvedMockupRoom('Johnson Basement', { spaceId: 'sp-johnson-basement',
      doorId: 'op-door-s', windowNorthId: 'op-win-n', windowEastId: 'op-win-e' }))
      .toEqual(goldenRoom());
  });

  it('hands out a fresh copy each call — callers mutate it', () => {
    const a = approvedMockupRoom();
    a.width_ft = 99;
    expect(approvedMockupRoom().width_ft).toBe(16);
  });

  it('is all-measured, so it derives measurement-backed', () => {
    expect(deriveTrustLevel(approvedMockupRoom())).toBe('measurement-backed');
  });
});
