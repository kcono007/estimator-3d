/**
 * @estimator3d/engine — deterministic takeoff + pricing.
 *
 * AI proposes. Rules calculate. The contractor approves.
 * Everything exported here is a pure function or a type. No network, no clock, no randomness.
 */

export * from './roomgraph';
export * from './takeoff';
export * from './ratebook';
export * from './estimate';
export * from './project';
export * from './proposal';
export * from './persist';
export * from './samples';

import seedJson from './ratebook.seed.json';
import { type RateBook, loadRateBook } from './ratebook';

/** The seed rate book, validated at import. Placeholder pricing — not market rates. */
export const seedRateBook: RateBook = loadRateBook(seedJson);

/** The raw seed array, for tests that want to mutate a copy and prove validation bites. */
export const seedRateBookJson: unknown = seedJson;
