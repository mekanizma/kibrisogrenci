/** Premium promote plans — Bronze / Gold / Platinum */

export const PREMIUM_PLANS = {
  bronze: {
    id: 'bronze',
    duration_days: 7,
    rank: 1,
    price_amount: 49.9,
    old_price_amount: 79,
    currency: 'TRY',
    // Visual + ranking flags applied when active
    boost_search: true,
    gold_border: false,
    badge: true,
    featured_section: false,
    sparkle: false,
    priority_support: false,
  },
  gold: {
    id: 'gold',
    duration_days: 30,
    rank: 2,
    price_amount: 129.9,
    old_price_amount: 199,
    currency: 'TRY',
    boost_search: true,
    gold_border: true,
    badge: true,
    featured_section: false,
    sparkle: false,
    priority_support: false,
  },
  platinum: {
    id: 'platinum',
    duration_days: 30,
    rank: 3,
    price_amount: 229.9,
    old_price_amount: 349,
    currency: 'TRY',
    boost_search: true,
    gold_border: false,
    badge: true,
    featured_section: true,
    sparkle: true,
    priority_support: true,
  },
};

export const PREMIUM_PLAN_IDS = Object.keys(PREMIUM_PLANS);

export function getPremiumPlan(id) {
  return PREMIUM_PLANS[id] || null;
}

/** Active if tier set and until is in the future (or until missing = treat inactive). */
export function isPremiumActive(listing, now = Date.now()) {
  if (!listing?.premium_tier) return false;
  if (!PREMIUM_PLANS[listing.premium_tier]) return false;
  if (!listing.premium_until) return false;
  const until = new Date(listing.premium_until).getTime();
  return Number.isFinite(until) && until > now;
}

export function premiumRankOf(listing, now = Date.now()) {
  if (!isPremiumActive(listing, now)) return 0;
  return PREMIUM_PLANS[listing.premium_tier]?.rank || 0;
}

export function premiumFeaturesOf(listing, now = Date.now()) {
  if (!isPremiumActive(listing, now)) return null;
  return PREMIUM_PLANS[listing.premium_tier] || null;
}

/** Normalize DB/API row into public premium fields. */
export function mapPremiumFields(row) {
  const tier = row?.premium_tier || null;
  const until = row?.premium_until || null;
  const active = isPremiumActive({ premium_tier: tier, premium_until: until });
  const plan = active ? PREMIUM_PLANS[tier] : null;
  return {
    premium_tier: active ? tier : null,
    premium_until: active ? until : null,
    premium_rank: plan?.rank || 0,
    featured: !!(active && (plan?.featured_section || plan?.boost_search)),
    premium: plan
      ? {
          tier,
          until,
          gold_border: !!plan.gold_border,
          badge: !!plan.badge,
          sparkle: !!plan.sparkle,
          featured_section: !!plan.featured_section,
          priority_support: !!plan.priority_support,
        }
      : null,
  };
}

export function computePremiumUntil(planId, from = new Date()) {
  const plan = getPremiumPlan(planId);
  if (!plan) return null;
  const d = new Date(from);
  d.setDate(d.getDate() + plan.duration_days);
  return d.toISOString();
}

/** Sort comparator: higher premium rank first, then published_at desc. */
export function comparePremiumThenDate(a, b) {
  const ra = premiumRankOf(a);
  const rb = premiumRankOf(b);
  if (rb !== ra) return rb - ra;
  const da = new Date(a.published_at || 0).getTime();
  const db = new Date(b.published_at || 0).getTime();
  return db - da;
}
