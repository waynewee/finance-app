create extension if not exists pgcrypto;

create table if not exists public.categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.subcategories (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  category_id text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  constraint subcategories_category_fk
    foreign key (user_id, category_id)
    references public.categories (user_id, id)
    on delete cascade
);

create table if not exists public.monthly_values (
  user_id uuid not null references auth.users (id) on delete cascade,
  year integer not null,
  month integer not null check (month between 0 and 11),
  subcategory_id text not null,
  value numeric(16, 2) not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, year, month, subcategory_id),
  constraint monthly_values_subcategory_fk
    foreign key (user_id, subcategory_id)
    references public.subcategories (user_id, id)
    on delete cascade
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(trim(coalesce(auth.jwt() ->> 'email', '')))
$$;

create table if not exists public.account_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  account_name text not null default 'My Household',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.account_collaborators (
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  collaborator_user_id uuid not null references auth.users (id) on delete cascade,
  collaborator_email text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (owner_user_id, collaborator_user_id),
  constraint account_collaborators_not_self
    check (owner_user_id <> collaborator_user_id)
);

create index if not exists account_collaborators_collaborator_idx
  on public.account_collaborators (collaborator_user_id);

create table if not exists public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  invitee_email text not null,
  invited_by_user_id uuid not null references auth.users (id) on delete cascade,
  claimed_by_user_id uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint account_invitations_email_not_blank
    check (length(trim(invitee_email)) > 0)
);

create unique index if not exists account_invitations_owner_email_idx
  on public.account_invitations (owner_user_id, invitee_email);

create index if not exists account_invitations_email_idx
  on public.account_invitations (invitee_email);

create or replace function public.can_access_account(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    auth.uid() = target_user_id
    or exists (
      select 1
      from public.account_collaborators collaborators
      where collaborators.owner_user_id = target_user_id
        and collaborators.collaborator_user_id = auth.uid()
    )
  )
$$;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

drop trigger if exists subcategories_set_updated_at on public.subcategories;
create trigger subcategories_set_updated_at
before update on public.subcategories
for each row
execute function public.set_updated_at();

drop trigger if exists monthly_values_set_updated_at on public.monthly_values;
create trigger monthly_values_set_updated_at
before update on public.monthly_values
for each row
execute function public.set_updated_at();

drop trigger if exists account_profiles_set_updated_at on public.account_profiles;
create trigger account_profiles_set_updated_at
before update on public.account_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists account_invitations_set_updated_at on public.account_invitations;
create trigger account_invitations_set_updated_at
before update on public.account_invitations
for each row
execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.monthly_values enable row level security;
alter table public.account_profiles enable row level security;
alter table public.account_collaborators enable row level security;
alter table public.account_invitations enable row level security;

drop policy if exists "account_profiles_select_accessible" on public.account_profiles;
create policy "account_profiles_select_accessible"
on public.account_profiles
for select
to authenticated
using (public.can_access_account(user_id));

drop policy if exists "account_profiles_insert_own" on public.account_profiles;
create policy "account_profiles_insert_own"
on public.account_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "account_profiles_update_own" on public.account_profiles;
create policy "account_profiles_update_own"
on public.account_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "account_collaborators_select_visible" on public.account_collaborators;
create policy "account_collaborators_select_visible"
on public.account_collaborators
for select
to authenticated
using (
  auth.uid() = owner_user_id
  or auth.uid() = collaborator_user_id
);

drop policy if exists "account_collaborators_insert_claimed_invite" on public.account_collaborators;
create policy "account_collaborators_insert_claimed_invite"
on public.account_collaborators
for insert
to authenticated
with check (
  collaborator_user_id = auth.uid()
  and collaborator_email = public.current_user_email()
  and exists (
    select 1
    from public.account_invitations invitations
    where invitations.owner_user_id = account_collaborators.owner_user_id
      and invitations.invitee_email = public.current_user_email()
      and invitations.claimed_at is null
  )
);

drop policy if exists "account_collaborators_delete_visible" on public.account_collaborators;
create policy "account_collaborators_delete_visible"
on public.account_collaborators
for delete
to authenticated
using (
  auth.uid() = owner_user_id
  or auth.uid() = collaborator_user_id
);

drop policy if exists "account_invitations_select_visible" on public.account_invitations;
create policy "account_invitations_select_visible"
on public.account_invitations
for select
to authenticated
using (
  auth.uid() = owner_user_id
  or public.current_user_email() = invitee_email
);

drop policy if exists "account_invitations_insert_own" on public.account_invitations;
create policy "account_invitations_insert_own"
on public.account_invitations
for insert
to authenticated
with check (
  auth.uid() = owner_user_id
  and auth.uid() = invited_by_user_id
);

drop policy if exists "account_invitations_update_owner" on public.account_invitations;
create policy "account_invitations_update_owner"
on public.account_invitations
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists "account_invitations_update_claim" on public.account_invitations;
create policy "account_invitations_update_claim"
on public.account_invitations
for update
to authenticated
using (
  public.current_user_email() = invitee_email
  and claimed_at is null
)
with check (
  public.current_user_email() = invitee_email
  and claimed_by_user_id = auth.uid()
  and claimed_at is not null
);

drop policy if exists "account_invitations_delete_owner" on public.account_invitations;
create policy "account_invitations_delete_owner"
on public.account_invitations
for delete
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own"
on public.categories
for select
to authenticated
using (public.can_access_account(user_id));

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own"
on public.categories
for insert
to authenticated
with check (public.can_access_account(user_id));

drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own"
on public.categories
for update
to authenticated
using (public.can_access_account(user_id))
with check (public.can_access_account(user_id));

drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own"
on public.categories
for delete
to authenticated
using (public.can_access_account(user_id));

drop policy if exists "subcategories_select_own" on public.subcategories;
create policy "subcategories_select_own"
on public.subcategories
for select
to authenticated
using (public.can_access_account(user_id));

drop policy if exists "subcategories_insert_own" on public.subcategories;
create policy "subcategories_insert_own"
on public.subcategories
for insert
to authenticated
with check (public.can_access_account(user_id));

drop policy if exists "subcategories_update_own" on public.subcategories;
create policy "subcategories_update_own"
on public.subcategories
for update
to authenticated
using (public.can_access_account(user_id))
with check (public.can_access_account(user_id));

drop policy if exists "subcategories_delete_own" on public.subcategories;
create policy "subcategories_delete_own"
on public.subcategories
for delete
to authenticated
using (public.can_access_account(user_id));

drop policy if exists "monthly_values_select_own" on public.monthly_values;
create policy "monthly_values_select_own"
on public.monthly_values
for select
to authenticated
using (public.can_access_account(user_id));

drop policy if exists "monthly_values_insert_own" on public.monthly_values;
create policy "monthly_values_insert_own"
on public.monthly_values
for insert
to authenticated
with check (public.can_access_account(user_id));

drop policy if exists "monthly_values_update_own" on public.monthly_values;
create policy "monthly_values_update_own"
on public.monthly_values
for update
to authenticated
using (public.can_access_account(user_id))
with check (public.can_access_account(user_id));

drop policy if exists "monthly_values_delete_own" on public.monthly_values;
create policy "monthly_values_delete_own"
on public.monthly_values
for delete
to authenticated
using (public.can_access_account(user_id));

create table if not exists public.fire_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null default 'primary',
  annual_spending_goal numeric(16, 2) not null default 60000,
  withdrawal_rate numeric(7, 4) not null default 4,
  expected_annual_return numeric(7, 4) not null default 7,
  monthly_contribution numeric(16, 2) not null default 2000,
  monthly_income numeric(16, 2) not null default 0,
  retirement_system jsonb,
  current_age integer,
  date_of_birth date,
  target_fire_age integer,
  contribution_stop_age integer,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

alter table public.fire_settings
add column if not exists date_of_birth date;

alter table public.fire_settings
add column if not exists monthly_income numeric(16, 2) not null default 0;

alter table public.fire_settings
add column if not exists retirement_system jsonb;

alter table public.fire_settings
add column if not exists contribution_stop_age integer;

drop trigger if exists fire_settings_set_updated_at on public.fire_settings;
create trigger fire_settings_set_updated_at
before update on public.fire_settings
for each row
execute function public.set_updated_at();

alter table public.fire_settings enable row level security;

drop policy if exists "fire_settings_select_own" on public.fire_settings;
create policy "fire_settings_select_own"
on public.fire_settings
for select
to authenticated
using (public.can_access_account(user_id));

drop policy if exists "fire_settings_insert_own" on public.fire_settings;
create policy "fire_settings_insert_own"
on public.fire_settings
for insert
to authenticated
with check (public.can_access_account(user_id));

drop policy if exists "fire_settings_update_own" on public.fire_settings;
create policy "fire_settings_update_own"
on public.fire_settings
for update
to authenticated
using (public.can_access_account(user_id))
with check (public.can_access_account(user_id));

drop policy if exists "fire_settings_delete_own" on public.fire_settings;
create policy "fire_settings_delete_own"
on public.fire_settings
for delete
to authenticated
using (public.can_access_account(user_id));

create table if not exists public.investment_assets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  symbol text not null,
  name text not null,
  target_percentage numeric(7, 4) not null default 0,
  current_price numeric(16, 4) not null default 0,
  share_increment numeric(16, 8) not null default 1,
  quote_updated_at timestamptz,
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

alter table public.investment_assets
add column if not exists quote_updated_at timestamptz;

alter table public.investment_assets
add column if not exists share_increment numeric(16, 8) not null default 1;

drop trigger if exists investment_assets_set_updated_at on public.investment_assets;
create trigger investment_assets_set_updated_at
before update on public.investment_assets
for each row
execute function public.set_updated_at();

alter table public.investment_assets enable row level security;

drop policy if exists "investment_assets_select_own" on public.investment_assets;
create policy "investment_assets_select_own"
on public.investment_assets
for select
to authenticated
using (public.can_access_account(user_id));

drop policy if exists "investment_assets_insert_own" on public.investment_assets;
create policy "investment_assets_insert_own"
on public.investment_assets
for insert
to authenticated
with check (public.can_access_account(user_id));

drop policy if exists "investment_assets_update_own" on public.investment_assets;
create policy "investment_assets_update_own"
on public.investment_assets
for update
to authenticated
using (public.can_access_account(user_id))
with check (public.can_access_account(user_id));

drop policy if exists "investment_assets_delete_own" on public.investment_assets;
create policy "investment_assets_delete_own"
on public.investment_assets
for delete
to authenticated
using (public.can_access_account(user_id));
