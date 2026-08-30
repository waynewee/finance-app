-- Neon (plain Postgres) schema for the single-user finance app.
-- No auth schema, no RLS, no per-user scoping: everything is one shared dataset
-- accessed only through the server-side API routes in /api (never directly from the browser).

create table if not exists categories (
  id text primary key,
  name text not null,
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists subcategories (
  id text primary key,
  category_id text not null references categories (id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  is_reference_only boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists monthly_values (
  year integer not null,
  month integer not null check (month between 0 and 11),
  subcategory_id text not null references subcategories (id) on delete cascade,
  value numeric(16, 2) not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (year, month, subcategory_id)
);

create table if not exists fire_settings (
  id text primary key default 'primary',
  annual_spending_goal numeric(16, 2) not null default 60000,
  pre_fire_annual_spending numeric(16, 2) not null default 0,
  withdrawal_rate numeric(6, 3) not null default 4,
  expected_annual_return numeric(6, 3) not null default 7,
  time_to_fire_algorithm text not null default 'ttm',
  annual_bonus_amount numeric(16, 2) not null default 0,
  non_recurring_bonus_amount numeric(16, 2) not null default 0,
  job_loss_monthly_savings_reduction numeric(16, 2) not null default 0,
  job_loss_monthly_savings_reduction_months integer,
  annual_bonus_month_added date,
  non_recurring_bonus_month_added date,
  monthly_contribution numeric(16, 2) not null default 0,
  monthly_income numeric(16, 2) not null default 0,
  retirement_system jsonb,
  current_age integer,
  date_of_birth date,
  target_fire_age integer,
  predicted_death_age integer,
  contribution_stop_age integer,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists investment_plan_settings (
  id text primary key default 'primary',
  monthly_investment_amount numeric(16, 2) not null default 0,
  rebalance_mode text not null default 'buy-only',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists investment_asset_categories (
  id text primary key,
  name text not null,
  current_value numeric(16, 2) not null default 0,
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists investment_assets (
  id text primary key,
  category_id text references investment_asset_categories (id) on delete cascade,
  symbol text not null,
  name text not null,
  target_percentage numeric(6, 3) not null default 0,
  current_price numeric(16, 4) not null default 0,
  share_increment numeric(16, 4) not null default 1,
  shares_owned numeric(16, 4) not null default 0,
  quote_updated_at timestamptz,
  manual_price numeric(16, 4),
  manual_price_updated_at timestamptz,
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists investment_allocation_profiles (
  id text primary key,
  name text not null,
  min_years_until_fire numeric(6, 2),
  max_years_until_fire numeric(6, 2),
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists investment_profile_allocations (
  profile_id text not null references investment_allocation_profiles (id) on delete cascade,
  category_id text not null,
  target_percentage numeric(6, 3) not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (profile_id, category_id)
);

-- Single password gate for revealing hidden balances. Only one row ever exists.
create table if not exists value_lock (
  id boolean primary key default true,
  password_hash text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint value_lock_singleton check (id)
);
