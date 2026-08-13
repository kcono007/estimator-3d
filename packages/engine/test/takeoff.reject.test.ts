import { describe, expect, it } from 'vitest';

import { GeometryError, takeoff, validateSpace } from '../src/takeoff';
import { opening, plainRoom } from './fixtures';

/**
 * GATE 2 (geometry half) — proof the engine REFUSES. A gate that only tests acceptance
 * is decoration.
 */
function expectGeometryRejection(fn: () => unknown, code: string): GeometryError {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught, 'expected a GeometryError, but nothing was thrown').toBeInstanceOf(GeometryError);
  const err = caught as GeometryError;
  expect(err.code).toBe(code);
  return err;
}

describe('REJECTION — impossible dimensions', () => {
  it('refuses zero width', () => {
    expectGeometryRejection(() => takeoff(plainRoom({ width_ft: 0 })), 'NON_POSITIVE_DIMENSION');
  });

  it('refuses negative depth', () => {
    expectGeometryRejection(() => takeoff(plainRoom({ depth_ft: -12 })), 'NON_POSITIVE_DIMENSION');
  });

  it('refuses zero height', () => {
    expectGeometryRejection(() => takeoff(plainRoom({ height_ft: 0 })), 'NON_POSITIVE_DIMENSION');
  });

  it('refuses NaN and Infinity, which would otherwise poison every downstream number', () => {
    expectGeometryRejection(() => takeoff(plainRoom({ width_ft: NaN })), 'NON_FINITE_DIMENSION');
    expectGeometryRejection(
      () => takeoff(plainRoom({ depth_ft: Number.POSITIVE_INFINITY })),
      'NON_FINITE_DIMENSION',
    );
  });

  it('refuses a zero-width opening', () => {
    expectGeometryRejection(
      () => takeoff(plainRoom({ openings: [opening({ width_ft: 0 })] })),
      'NON_POSITIVE_DIMENSION',
    );
  });
});

describe('REJECTION — an opening bigger than the wall it sits in', () => {
  it('refuses an opening wider than its wall', () => {
    const err = expectGeometryRejection(
      () => takeoff(plainRoom({ width_ft: 10, openings: [opening({ wall: 'N', width_ft: 11 })] })),
      'OPENING_WIDER_THAN_WALL',
    );
    expect(err.openingIds).toEqual(['op-1']);
  });

  it('measures width against the RIGHT wall — 11 ft fits on a 16 ft N wall but not a 10 ft E wall', () => {
    const wide = plainRoom({ width_ft: 16, depth_ft: 10 });
    expect(() =>
      takeoff({ ...wide, openings: [opening({ wall: 'N', width_ft: 11 })] }),
    ).not.toThrow();
    expectGeometryRejection(
      () => takeoff({ ...wide, openings: [opening({ id: 'op-e', wall: 'E', width_ft: 11 })] }),
      'OPENING_WIDER_THAN_WALL',
    );
  });

  it('refuses an opening taller than the space', () => {
    expectGeometryRejection(
      () => takeoff(plainRoom({ height_ft: 8, openings: [opening({ height_ft: 9 })] })),
      'OPENING_TALLER_THAN_WALL',
    );
  });

  it('refuses a window whose head runs through the ceiling', () => {
    expectGeometryRejection(
      () => takeoff(plainRoom({ height_ft: 8, openings: [opening({ sill_ft: 6, height_ft: 3 })] })),
      'OPENING_ABOVE_CEILING',
    );
  });

  it('refuses an opening positioned past the end of its wall', () => {
    expectGeometryRejection(
      () =>
        takeoff(
          plainRoom({ width_ft: 10, openings: [opening({ wall: 'N', width_ft: 4, offset_ft: 7 })] }),
        ),
      'OPENING_OFF_WALL',
    );
  });
});

describe('REJECTION — openings that cannot coexist on one wall', () => {
  it('refuses openings whose widths exceed the wall length', () => {
    const err = expectGeometryRejection(
      () =>
        takeoff(
          plainRoom({
            width_ft: 10,
            openings: [
              opening({ id: 'a', wall: 'N', width_ft: 6 }),
              opening({ id: 'b', wall: 'N', width_ft: 5 }),
            ],
          }),
        ),
      'OPENINGS_EXCEED_WALL_LENGTH',
    );
    expect(err.openingIds).toEqual(['a', 'b']);
  });

  it('refuses two positioned openings that overlap', () => {
    const err = expectGeometryRejection(
      () =>
        takeoff(
          plainRoom({
            width_ft: 16,
            openings: [
              opening({ id: 'a', wall: 'N', width_ft: 4, offset_ft: 2 }),
              opening({ id: 'b', wall: 'N', width_ft: 4, offset_ft: 5 }),
            ],
          }),
        ),
      'OPENINGS_OVERLAP',
    );
    expect(err.openingIds).toEqual(['a', 'b']);
  });

  it('accepts two positioned openings that merely touch edge to edge', () => {
    expect(() =>
      takeoff(
        plainRoom({
          width_ft: 16,
          openings: [
            opening({ id: 'a', wall: 'N', width_ft: 4, offset_ft: 2 }),
            opening({ id: 'b', wall: 'N', width_ft: 4, offset_ft: 6 }),
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('does not confuse walls — the same offsets on different walls are fine', () => {
    expect(() =>
      takeoff(
        plainRoom({
          width_ft: 16,
          depth_ft: 16,
          openings: [
            opening({ id: 'a', wall: 'N', width_ft: 4, offset_ft: 2 }),
            opening({ id: 'b', wall: 'S', width_ft: 4, offset_ft: 2 }),
            opening({ id: 'c', wall: 'E', width_ft: 4, offset_ft: 2 }),
            opening({ id: 'd', wall: 'W', width_ft: 4, offset_ft: 2 }),
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('refuses duplicate opening ids', () => {
    expectGeometryRejection(
      () =>
        takeoff(
          plainRoom({
            width_ft: 16,
            openings: [opening({ id: 'same' }), opening({ id: 'same', offset_ft: 8 })],
          }),
        ),
      'DUPLICATE_OPENING_ID',
    );
  });
});

describe('REJECTION — the refusal is a real typed error', () => {
  it('is a GeometryError with a name, a code, and a readable message', () => {
    const err = expectGeometryRejection(
      () => validateSpace(plainRoom({ width_ft: -1 })),
      'NON_POSITIVE_DIMENSION',
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('GeometryError');
    expect(err.message).toContain('width_ft');
  });
});
