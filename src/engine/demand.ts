/**
 * One point of elasticity is 10_000 bps. Prices are integer MQ cents;
 * percentages and units use integer arithmetic only.
 *
 * Demand is linear around the stored reference price. The multiplier is
 * bounded to [0, 2], then demand is bounded by the bakery's capacity.
 * Rounding is toward zero, so fractional bread units are never produced.
 */
export type BakeryDemand = {
  referencePriceCents: bigint;
  priceCents: bigint;
  baselineUnits: number;
  elasticityBps: number;
  capacity: number;
};

function units(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a nonnegative safe integer`);
}

export function calculateBakeryDemand(input: BakeryDemand): number {
  const { referencePriceCents, priceCents, baselineUnits, elasticityBps, capacity } = input;
  if (typeof referencePriceCents !== "bigint" || typeof priceCents !== "bigint" ||
      referencePriceCents <= 0n || priceCents <= 0n) throw new RangeError("Bakery prices must be positive integer cents");
  units(baselineUnits, "baselineUnits");
  units(capacity, "capacity");
  units(elasticityBps, "elasticityBps");
  if (elasticityBps > 20_000) throw new RangeError("Bakery elasticity exceeds 20,000 bps");

  // Single rational expression avoids loss from two sequential divisions.
  const numerator = (priceCents - referencePriceCents) * BigInt(elasticityBps);
  const adjustment = numerator / referencePriceCents;
  const multiplier = 10_000n - adjustment;
  const bounded = multiplier < 0n ? 0n : multiplier > 20_000n ? 20_000n : multiplier;
  const calculated = BigInt(baselineUnits) * bounded / 10_000n;
  // Comparison and casting are safe: capacity was validated as a safe integer.
  return Number(calculated > BigInt(capacity) ? BigInt(capacity) : calculated);
}
