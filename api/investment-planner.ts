import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db";
import { readJsonBody, sendError } from "./_lib/http";

interface HoldingInput {
  id: string;
  symbol: string;
  name: string;
  sharesOwned: number;
  currentPrice: number;
  quoteUpdatedAt: string | null;
  manualPrice: number | null;
  manualPriceUpdatedAt: string | null;
  sortOrder: number;
}

interface CategoryInput {
  id: string;
  name: string;
  currentValue: number;
  sortOrder: number;
  holdings: HoldingInput[];
}

interface ProfileInput {
  id: string;
  name: string;
  minYearsUntilFire: number | null;
  maxYearsUntilFire: number | null;
  sortOrder: number;
  allocations: Record<string, number>;
}

interface ReplacePayload {
  settings: { monthlyInvestmentAmount: number; rebalanceMode: string };
  categories: CategoryInput[];
  profiles: ProfileInput[];
}

async function handleGet(res: VercelResponse) {
  const [settingsRows, categoryRows, holdingRows, profileRows, allocationRows] =
    await Promise.all([
      sql`select * from investment_plan_settings where id = 'primary'`,
      sql`select id, name, current_value, sort_order from investment_asset_categories order by sort_order`,
      sql`select * from investment_assets order by sort_order`,
      sql`select id, name, min_years_until_fire, max_years_until_fire, sort_order
          from investment_allocation_profiles order by sort_order`,
      sql`select profile_id, category_id, target_percentage from investment_profile_allocations`,
    ]);

  res.status(200).json({
    settingsRow: settingsRows[0] ?? null,
    categoryRows,
    holdingRows,
    profileRows,
    allocationRows,
  });
}

async function handleReplace(res: VercelResponse, payload: ReplacePayload) {
  const { settings, categories, profiles } = payload;

  const categoryIds = categories.map((category) => category.id);
  const holdingIds = categories.flatMap((category) =>
    category.holdings.map((holding) => holding.id),
  );
  const profileIds = profiles.map((profile) => profile.id);

  if (holdingIds.length > 0) {
    await sql`delete from investment_assets where not (id = any(${holdingIds}))`;
  } else {
    await sql`delete from investment_assets`;
  }

  if (profileIds.length > 0) {
    await sql`delete from investment_allocation_profiles where not (id = any(${profileIds}))`;
  } else {
    await sql`delete from investment_allocation_profiles`;
  }

  if (categoryIds.length > 0) {
    await sql`delete from investment_asset_categories where not (id = any(${categoryIds}))`;
  } else {
    await sql`delete from investment_asset_categories`;
  }

  await sql`
    insert into investment_plan_settings (id, monthly_investment_amount, rebalance_mode, updated_at)
    values ('primary', ${settings.monthlyInvestmentAmount}, ${settings.rebalanceMode}, now())
    on conflict (id) do update set
      monthly_investment_amount = excluded.monthly_investment_amount,
      rebalance_mode = excluded.rebalance_mode,
      updated_at = now()
  `;

  for (const category of categories) {
    await sql`
      insert into investment_asset_categories (id, name, current_value, sort_order, updated_at)
      values (${category.id}, ${category.name}, ${category.currentValue}, ${category.sortOrder}, now())
      on conflict (id) do update set
        name = excluded.name,
        current_value = excluded.current_value,
        sort_order = excluded.sort_order,
        updated_at = now()
    `;

    for (const holding of category.holdings) {
      await sql`
        insert into investment_assets (
          id, category_id, symbol, name, current_price, shares_owned,
          quote_updated_at, manual_price, manual_price_updated_at, sort_order, updated_at
        ) values (
          ${holding.id}, ${category.id}, ${holding.symbol}, ${holding.name}, ${holding.currentPrice}, ${holding.sharesOwned},
          ${holding.quoteUpdatedAt}, ${holding.manualPrice}, ${holding.manualPriceUpdatedAt}, ${holding.sortOrder}, now()
        )
        on conflict (id) do update set
          category_id = excluded.category_id,
          symbol = excluded.symbol,
          name = excluded.name,
          current_price = excluded.current_price,
          shares_owned = excluded.shares_owned,
          quote_updated_at = excluded.quote_updated_at,
          manual_price = excluded.manual_price,
          manual_price_updated_at = excluded.manual_price_updated_at,
          sort_order = excluded.sort_order,
          updated_at = now()
      `;
    }
  }

  for (const profile of profiles) {
    await sql`
      insert into investment_allocation_profiles (id, name, min_years_until_fire, max_years_until_fire, sort_order, updated_at)
      values (${profile.id}, ${profile.name}, ${profile.minYearsUntilFire}, ${profile.maxYearsUntilFire}, ${profile.sortOrder}, now())
      on conflict (id) do update set
        name = excluded.name,
        min_years_until_fire = excluded.min_years_until_fire,
        max_years_until_fire = excluded.max_years_until_fire,
        sort_order = excluded.sort_order,
        updated_at = now()
    `;
  }

  await sql`delete from investment_profile_allocations`;

  for (const profile of profiles) {
    for (const [categoryId, targetPercentage] of Object.entries(
      profile.allocations,
    )) {
      if (!categoryId.trim()) {
        continue;
      }

      await sql`
        insert into investment_profile_allocations (profile_id, category_id, target_percentage, updated_at)
        values (${profile.id}, ${categoryId}, ${targetPercentage}, now())
      `;
    }
  }

  res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      await handleGet(res);
      return;
    }

    if (req.method === "PUT") {
      const body = await readJsonBody<ReplacePayload>(req);
      await handleReplace(res, body);
      return;
    }

    sendError(res, 405, "Method not allowed");
  } catch (error) {
    sendError(
      res,
      500,
      error instanceof Error ? error.message : "Unexpected server error",
    );
  }
}
