// One-time migration script: copies your existing Supabase data into the new
// Neon single-user schema. Safe to run more than once (upserts by primary key).
//
// Usage (PowerShell):
//   $env:SUPABASE_DB_URL = "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"
//   $env:DATABASE_URL = "<your Neon connection string>"
//   node scripts/migrate-from-supabase.mjs
//
// Get SUPABASE_DB_URL from the Supabase dashboard: Project Settings -> Database
// -> Connection string -> URI (use the "Direct connection" one, not the pooler,
// and fill in your database password).

import pg from "pg";

const { Client } = pg;

const supabaseUrl = process.env.SUPABASE_DB_URL;
const neonUrl = process.env.DATABASE_URL;

if (!supabaseUrl) {
  console.error("Missing SUPABASE_DB_URL environment variable.");
  process.exit(1);
}

if (!neonUrl) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

const source = new Client({ connectionString: supabaseUrl });
const target = new Client({ connectionString: neonUrl });

async function copyTable({ label, selectSql, insertSql, mapRow }) {
  const { rows } = await source.query(selectSql);
  console.log(`${label}: found ${rows.length} row(s) in Supabase`);

  for (const row of rows) {
    const values = mapRow(row);
    await target.query(insertSql, values);
  }

  console.log(`${label}: migrated ${rows.length} row(s) into Neon`);
}

async function main() {
  await source.connect();
  await target.connect();

  try {
    await copyTable({
      label: "categories",
      selectSql: `select id, name, archived, sort_order, created_at, updated_at from categories`,
      insertSql: `
        insert into categories (id, name, archived, sort_order, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (id) do update set
          name = excluded.name,
          archived = excluded.archived,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `,
      mapRow: (r) => [r.id, r.name, r.archived, r.sort_order, r.created_at, r.updated_at],
    });

    await copyTable({
      label: "subcategories",
      selectSql: `select id, category_id, name, archived, is_reference_only, sort_order, created_at, updated_at from subcategories`,
      insertSql: `
        insert into subcategories (id, category_id, name, archived, is_reference_only, sort_order, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (id) do update set
          category_id = excluded.category_id,
          name = excluded.name,
          archived = excluded.archived,
          is_reference_only = excluded.is_reference_only,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `,
      mapRow: (r) => [
        r.id,
        r.category_id,
        r.name,
        r.archived,
        r.is_reference_only,
        r.sort_order,
        r.created_at,
        r.updated_at,
      ],
    });

    await copyTable({
      label: "monthly_values",
      selectSql: `select year, month, subcategory_id, value, updated_at from monthly_values`,
      insertSql: `
        insert into monthly_values (year, month, subcategory_id, value, updated_at)
        values ($1, $2, $3, $4, $5)
        on conflict (year, month, subcategory_id) do update set
          value = excluded.value,
          updated_at = excluded.updated_at
      `,
      mapRow: (r) => [r.year, r.month, r.subcategory_id, r.value, r.updated_at],
    });

    await copyTable({
      label: "fire_settings",
      selectSql: `select * from fire_settings limit 1`,
      insertSql: `
        insert into fire_settings (
          id, annual_spending_goal, pre_fire_annual_spending, withdrawal_rate,
          expected_annual_return, time_to_fire_algorithm, annual_bonus_amount,
          non_recurring_bonus_amount, job_loss_monthly_savings_reduction,
          job_loss_monthly_savings_reduction_months, annual_bonus_month_added,
          non_recurring_bonus_month_added, monthly_contribution, monthly_income,
          retirement_system, current_age, date_of_birth, target_fire_age,
          predicted_death_age, contribution_stop_age, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        on conflict (id) do update set
          annual_spending_goal = excluded.annual_spending_goal,
          pre_fire_annual_spending = excluded.pre_fire_annual_spending,
          withdrawal_rate = excluded.withdrawal_rate,
          expected_annual_return = excluded.expected_annual_return,
          time_to_fire_algorithm = excluded.time_to_fire_algorithm,
          annual_bonus_amount = excluded.annual_bonus_amount,
          non_recurring_bonus_amount = excluded.non_recurring_bonus_amount,
          job_loss_monthly_savings_reduction = excluded.job_loss_monthly_savings_reduction,
          job_loss_monthly_savings_reduction_months = excluded.job_loss_monthly_savings_reduction_months,
          annual_bonus_month_added = excluded.annual_bonus_month_added,
          non_recurring_bonus_month_added = excluded.non_recurring_bonus_month_added,
          monthly_contribution = excluded.monthly_contribution,
          monthly_income = excluded.monthly_income,
          retirement_system = excluded.retirement_system,
          current_age = excluded.current_age,
          date_of_birth = excluded.date_of_birth,
          target_fire_age = excluded.target_fire_age,
          predicted_death_age = excluded.predicted_death_age,
          contribution_stop_age = excluded.contribution_stop_age,
          updated_at = excluded.updated_at
      `,
      mapRow: (r) => [
        "primary",
        r.annual_spending_goal,
        r.pre_fire_annual_spending,
        r.withdrawal_rate,
        r.expected_annual_return,
        r.time_to_fire_algorithm,
        r.annual_bonus_amount,
        r.non_recurring_bonus_amount,
        r.job_loss_monthly_savings_reduction,
        r.job_loss_monthly_savings_reduction_months,
        r.annual_bonus_month_added,
        r.non_recurring_bonus_month_added,
        r.monthly_contribution,
        r.monthly_income,
        r.retirement_system,
        r.current_age,
        r.date_of_birth,
        r.target_fire_age,
        r.predicted_death_age,
        r.contribution_stop_age,
        r.updated_at,
      ],
    });

    await copyTable({
      label: "investment_asset_categories",
      selectSql: `select id, name, current_value, sort_order, updated_at from investment_asset_categories`,
      insertSql: `
        insert into investment_asset_categories (id, name, current_value, sort_order, updated_at)
        values ($1, $2, $3, $4, $5)
        on conflict (id) do update set
          name = excluded.name,
          current_value = excluded.current_value,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `,
      mapRow: (r) => [r.id, r.name, r.current_value, r.sort_order, r.updated_at],
    });

    await copyTable({
      label: "investment_assets",
      selectSql: `
        select id, category_id, symbol, name, target_percentage, current_price,
               share_increment, shares_owned, quote_updated_at, manual_price,
               manual_price_updated_at, sort_order, updated_at
        from investment_assets
      `,
      insertSql: `
        insert into investment_assets (
          id, category_id, symbol, name, target_percentage, current_price,
          share_increment, shares_owned, quote_updated_at, manual_price,
          manual_price_updated_at, sort_order, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        on conflict (id) do update set
          category_id = excluded.category_id,
          symbol = excluded.symbol,
          name = excluded.name,
          target_percentage = excluded.target_percentage,
          current_price = excluded.current_price,
          share_increment = excluded.share_increment,
          shares_owned = excluded.shares_owned,
          quote_updated_at = excluded.quote_updated_at,
          manual_price = excluded.manual_price,
          manual_price_updated_at = excluded.manual_price_updated_at,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `,
      mapRow: (r) => [
        r.id,
        r.category_id,
        r.symbol,
        r.name,
        r.target_percentage,
        r.current_price,
        r.share_increment,
        r.shares_owned,
        r.quote_updated_at,
        r.manual_price,
        r.manual_price_updated_at,
        r.sort_order,
        r.updated_at,
      ],
    });

    await copyTable({
      label: "investment_plan_settings",
      selectSql: `select monthly_investment_amount, rebalance_mode, updated_at from investment_plan_settings limit 1`,
      insertSql: `
        insert into investment_plan_settings (id, monthly_investment_amount, rebalance_mode, updated_at)
        values ($1, $2, $3, $4)
        on conflict (id) do update set
          monthly_investment_amount = excluded.monthly_investment_amount,
          rebalance_mode = excluded.rebalance_mode,
          updated_at = excluded.updated_at
      `,
      mapRow: (r) => ["primary", r.monthly_investment_amount, r.rebalance_mode, r.updated_at],
    });

    await copyTable({
      label: "investment_allocation_profiles",
      selectSql: `select id, name, min_years_until_fire, max_years_until_fire, sort_order, updated_at from investment_allocation_profiles`,
      insertSql: `
        insert into investment_allocation_profiles (id, name, min_years_until_fire, max_years_until_fire, sort_order, updated_at)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (id) do update set
          name = excluded.name,
          min_years_until_fire = excluded.min_years_until_fire,
          max_years_until_fire = excluded.max_years_until_fire,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `,
      mapRow: (r) => [
        r.id,
        r.name,
        r.min_years_until_fire,
        r.max_years_until_fire,
        r.sort_order,
        r.updated_at,
      ],
    });

    await copyTable({
      label: "investment_profile_allocations",
      selectSql: `select profile_id, category_id, target_percentage, updated_at from investment_profile_allocations`,
      insertSql: `
        insert into investment_profile_allocations (profile_id, category_id, target_percentage, updated_at)
        values ($1, $2, $3, $4)
        on conflict (profile_id, category_id) do update set
          target_percentage = excluded.target_percentage,
          updated_at = excluded.updated_at
      `,
      mapRow: (r) => [r.profile_id, r.category_id, r.target_percentage, r.updated_at],
    });

    // The old password hash is a standard bcrypt hash (pgcrypto's crypt() with
    // gen_salt('bf', ...)), which is directly compatible with bcryptjs, so we
    // can carry it over as-is without knowing the plaintext password.
    await copyTable({
      label: "value_lock",
      selectSql: `select password_hash, updated_at from account_value_locks limit 1`,
      insertSql: `
        insert into value_lock (id, password_hash, updated_at)
        values (true, $1, $2)
        on conflict (id) do update set
          password_hash = excluded.password_hash,
          updated_at = excluded.updated_at
      `,
      mapRow: (r) => [r.password_hash, r.updated_at],
    });

    console.log("\nMigration complete.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
