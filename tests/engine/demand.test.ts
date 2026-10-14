import { describe, expect, it } from "vitest";
import { calculateBakeryDemand } from "../../src/engine/demand";

const base = {
  referencePriceCents: 100n,
  priceCents: 100n,
  baselineUnits: 10,
  elasticityBps: 10000,
  capacity: 100,
};

describe("Phase 2: bounded bakery price elasticity", () => {
  it("keeps baseline demand at the reference price", () => {
    expect(calculateBakeryDemand(base)).toBe(10);
  });
  it("reduces demand when the price increases, with deterministic integer rounding", () => {
    expect(calculateBakeryDemand({ ...base, priceCents: 150n })).toBe(5);
    expect(calculateBakeryDemand({ ...base, priceCents: 200n })).toBe(0);
    expect(calculateBakeryDemand({ ...base, priceCents: 10000n })).toBe(0);
  });
  it("increases demand for lower prices, capped at twice baseline and physical capacity", () => {
    expect(calculateBakeryDemand({ ...base, priceCents: 50n })).toBe(15);
    expect(calculateBakeryDemand({ ...base, priceCents: 1n, elasticityBps: 20000 })).toBe(20);
    expect(calculateBakeryDemand({ ...base, priceCents: 1n, elasticityBps: 20000, capacity: 7 })).toBe(7);
  });
  it("honors zero elasticity and integer-cent prices beyond Number.MAX_SAFE_INTEGER", () => {
    const exactPrice = 9007199254740993n;
    expect(calculateBakeryDemand({ ...base, referencePriceCents: exactPrice, priceCents: exactPrice, elasticityBps: 0 })).toBe(10);
  });
  it("refuses invalid prices, elasticity or fractional unit counts", () => {
    expect(() => calculateBakeryDemand({ ...base, priceCents: 0n })).toThrow();
    expect(() => calculateBakeryDemand({ ...base, elasticityBps: 20001 })).toThrow();
    expect(() => calculateBakeryDemand({ ...base, baselineUnits: 0.5 })).toThrow();
  });
});
