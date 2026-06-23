import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLANS,
  PLAN_TIERS,
  UNLIMITED,
  formatLimit,
  getPlanLimits,
  isPaidTier,
  isUnlimited,
} from "./plans";

describe("PLAN_TIERS", () => {
  it("is ordered cheapest first and matches the enum", () => {
    expect(PLAN_TIERS).toEqual(["free", "pro", "business"]);
  });
});

describe("free plan", () => {
  it("cannot connect WhatsApp (the paywall)", () => {
    expect(getPlanLimits("free").maxWhatsappNumbers).toBe(0);
    expect(isPaidTier("free")).toBe(false);
  });

  it("has zero capacity for gated resources", () => {
    const f = getPlanLimits("free");
    expect(f.monthlyBroadcasts).toBe(0);
    expect(f.maxAutomations).toBe(0);
    expect(f.maxFlows).toBe(0);
  });
});

describe("paid plans", () => {
  it("can connect WhatsApp", () => {
    expect(isPaidTier("pro")).toBe(true);
    expect(isPaidTier("business")).toBe(true);
    expect(getPlanLimits("pro").maxWhatsappNumbers).toBeGreaterThan(0);
    expect(getPlanLimits("business").maxWhatsappNumbers).toBeGreaterThan(0);
  });

  it("prices match the agreed values (R$99 / R$249)", () => {
    expect(PLANS.pro.priceMonthlyBRL).toBe(99);
    expect(PLANS.business.priceMonthlyBRL).toBe(249);
  });

  it("each paid tier maps to a Stripe price env var", () => {
    expect(PLANS.pro.stripePriceEnv).toBe("STRIPE_PRICE_PRO");
    expect(PLANS.business.stripePriceEnv).toBe("STRIPE_PRICE_BUSINESS");
  });

  it("business is unlimited where pro is capped", () => {
    expect(isUnlimited(getPlanLimits("business").maxContacts)).toBe(true);
    expect(isUnlimited(getPlanLimits("pro").maxContacts)).toBe(false);
  });
});

describe("formatLimit", () => {
  it("renders unlimited as a label and numbers verbatim", () => {
    expect(formatLimit(UNLIMITED)).toBe("Ilimitado");
    expect(formatLimit(10)).toBe("10");
    expect(formatLimit(0)).toBe("0");
  });
});

describe("env var overrides for maxWhatsappNumbers", () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear env vars so each test runs against a clean, deterministic state.
    vi.stubEnv("NEXT_PUBLIC_PRO_MAX_WHATSAPP_NUMBERS", "");
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_MAX_WHATSAPP_NUMBERS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Business defaults to 3 maxWhatsappNumbers", async () => {
    const { getPlanLimits } = await import("./plans");
    expect(getPlanLimits("business").maxWhatsappNumbers).toBe(3);
  });

  it("Pro defaults to 1 maxWhatsappNumbers", async () => {
    const { getPlanLimits } = await import("./plans");
    expect(getPlanLimits("pro").maxWhatsappNumbers).toBe(1);
  });

  it("Free has 0 maxWhatsappNumbers", async () => {
    const { getPlanLimits } = await import("./plans");
    expect(getPlanLimits("free").maxWhatsappNumbers).toBe(0);
  });

  it("Business maxWhatsappNumbers > 0 (paid tier)", async () => {
    const { isPaidTier } = await import("./plans");
    expect(isPaidTier("business")).toBe(true);
  });

  it("Free is not a paid tier", async () => {
    const { isPaidTier } = await import("./plans");
    expect(isPaidTier("free")).toBe(false);
  });
});
