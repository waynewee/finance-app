import { DEFAULT_CATEGORIES, type Category } from "../data/defaultCategories";
import type { RetirementSystemConfig } from "./retirementSystem";
import { supabase } from "./supabase";

export interface FireSettings {
  annualSpendingGoal: number;
  preFireAnnualSpending: number;
  withdrawalRate: number;
  expectedAnnualReturn: number;
  dateOfBirth: string | null;
  targetFireAge: number | null;
  predictedDeathAge: number | null;
  retirementContributionStopAge: number | null;
  retirementSystem: RetirementSystemConfig | null;
}

export const DEFAULT_FIRE_SETTINGS: FireSettings = {
  annualSpendingGoal: 60_000,
  preFireAnnualSpending: 0,
  withdrawalRate: 4,
  expectedAnnualReturn: 7,
  dateOfBirth: null,
  targetFireAge: null,
  predictedDeathAge: null,
  retirementContributionStopAge: null,
  retirementSystem: null,
};

export type MonthlyData = Record<
  string,
  Record<number, Record<string, number>>
>;

interface CategoryRow {
  user_id: string;
  id: string;
  name: string;
  sort_order: number;
}

interface SubcategoryRow {
  user_id: string;
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
}

interface MonthlyValueRow {
  user_id: string;
  year: number;
  month: number;
  subcategory_id: string;
  value: number;
  updated_at: string;
}

interface FireSettingsRow {
  user_id: string;
  id: string;
  annual_spending_goal: number;
  pre_fire_annual_spending?: number | null;
  withdrawal_rate: number;
  expected_annual_return: number;
  monthly_contribution: number;
  monthly_income?: number | null;
  retirement_system?: RetirementSystemConfig | null;
  current_age?: number | null;
  date_of_birth?: string | null;
  target_fire_age: number | null;
  predicted_death_age?: number | null;
  contribution_stop_age?: number | null;
  updated_at: string;
}

const FIRE_SETTINGS_ROW_ID = "primary";

function inferDateOfBirthFromCurrentAge(
  currentAge: number | null | undefined,
): string | null {
  if (currentAge == null || currentAge <= 0) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  return `${currentYear - currentAge}-01-01`;
}

function mapFireSettingsRow(row?: FireSettingsRow | null): FireSettings {
  if (!row) {
    return DEFAULT_FIRE_SETTINGS;
  }

  return {
    annualSpendingGoal: row.annual_spending_goal,
    preFireAnnualSpending: row.pre_fire_annual_spending ?? 0,
    withdrawalRate: row.withdrawal_rate,
    expectedAnnualReturn: row.expected_annual_return,
    dateOfBirth:
      row.date_of_birth ?? inferDateOfBirthFromCurrentAge(row.current_age),
    targetFireAge: row.target_fire_age,
    predictedDeathAge: row.predicted_death_age ?? null,
    retirementContributionStopAge:
      row.contribution_stop_age ?? row.target_fire_age,
    retirementSystem: row.retirement_system ?? null,
  };
}

function mapFireSettingsToRow(
  userId: string,
  settings: FireSettings,
): FireSettingsRow {
  return {
    user_id: userId,
    id: FIRE_SETTINGS_ROW_ID,
    annual_spending_goal: settings.annualSpendingGoal,
    pre_fire_annual_spending: settings.preFireAnnualSpending,
    withdrawal_rate: settings.withdrawalRate,
    expected_annual_return: settings.expectedAnnualReturn,
    monthly_contribution: 0,
    monthly_income: 0,
    retirement_system: settings.retirementSystem,
    current_age: null,
    date_of_birth: settings.dateOfBirth,
    target_fire_age: settings.targetFireAge,
    predicted_death_age: settings.predictedDeathAge,
    contribution_stop_age: settings.retirementContributionStopAge,
    updated_at: new Date().toISOString(),
  };
}

function buildCategories(
  categoryRows: CategoryRow[],
  subcategoryRows: SubcategoryRow[],
): Category[] {
  return categoryRows.map((categoryRow) => ({
    id: categoryRow.id,
    name: categoryRow.name,
    subcategories: subcategoryRows
      .filter((subcategoryRow) => subcategoryRow.category_id === categoryRow.id)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((subcategoryRow) => ({
        id: subcategoryRow.id,
        name: subcategoryRow.name,
      })),
  }));
}

function buildMonthlyData(rows: MonthlyValueRow[]): MonthlyData {
  return rows.reduce<MonthlyData>((result, row) => {
    const yearKey = String(row.year);
    result[yearKey] ??= {};
    result[yearKey][row.month] ??= {};
    result[yearKey][row.month][row.subcategory_id] = row.value;
    return result;
  }, {});
}

async function seedDefaultCategoriesIfNeeded(userId: string): Promise<void> {
  const { data: existingCategories, error } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId);

  if (error || existingCategories.length > 0) {
    return;
  }

  await replaceCategories(userId, DEFAULT_CATEGORIES);
}

export async function loadNetWorthState(userId: string): Promise<{
  categories: Category[];
  monthlyData: MonthlyData;
  fireSettings: FireSettings;
}> {
  await seedDefaultCategoriesIfNeeded(userId);

  const [
    { data: categoryRows, error: categoriesError },
    { data: subcategoryRows, error: subcategoriesError },
    { data: monthlyRows, error: monthlyError },
    { data: fireSettingsRows, error: fireSettingsError },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("user_id, id, name, sort_order")
      .eq("user_id", userId)
      .order("sort_order"),
    supabase
      .from("subcategories")
      .select("user_id, id, category_id, name, sort_order")
      .eq("user_id", userId)
      .order("sort_order"),
    supabase
      .from("monthly_values")
      .select("user_id, year, month, subcategory_id, value, updated_at")
      .eq("user_id", userId),
    supabase
      .from("fire_settings")
      .select(
        "user_id, id, annual_spending_goal, pre_fire_annual_spending, withdrawal_rate, expected_annual_return, monthly_contribution, monthly_income, retirement_system, current_age, date_of_birth, target_fire_age, predicted_death_age, contribution_stop_age, updated_at",
      )
      .eq("user_id", userId),
  ]);

  const error =
    categoriesError ?? subcategoriesError ?? monthlyError ?? fireSettingsError;
  if (error) {
    throw error;
  }

  return {
    categories: buildCategories(categoryRows ?? [], subcategoryRows ?? []),
    monthlyData: buildMonthlyData(monthlyRows ?? []),
    fireSettings: mapFireSettingsRow(fireSettingsRows?.[0]),
  };
}

export async function saveMonthlyValue(
  userId: string,
  year: number,
  month: number,
  subcategoryId: string,
  value: number,
): Promise<void> {
  if (value === 0) {
    const { error } = await supabase
      .from("monthly_values")
      .delete()
      .eq("user_id", userId)
      .eq("year", year)
      .eq("month", month)
      .eq("subcategory_id", subcategoryId);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase.from("monthly_values").upsert(
    {
      user_id: userId,
      year,
      month,
      subcategory_id: subcategoryId,
      value,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id,year,month,subcategory_id",
    },
  );

  if (error) {
    throw error;
  }
}

export async function replaceYearMonthlyValues(
  userId: string,
  year: number,
  valuesBySubcategory: Record<string, number[]>,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("monthly_values")
    .delete()
    .eq("user_id", userId)
    .eq("year", year);

  if (deleteError) {
    throw deleteError;
  }

  const rows = Object.entries(valuesBySubcategory).flatMap(
    ([subcategoryId, values]) =>
      values
        .map((value, month) => ({ month, value, subcategoryId }))
        .filter((entry) => entry.value !== 0)
        .map((entry) => ({
          user_id: userId,
          year,
          month: entry.month,
          subcategory_id: subcategoryId,
          value: entry.value,
          updated_at: new Date().toISOString(),
        })),
  );

  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("monthly_values")
    .insert(rows);

  if (insertError) {
    throw insertError;
  }
}

export async function replaceCategories(
  userId: string,
  categories: Category[],
): Promise<void> {
  const categoryRows: CategoryRow[] = categories.map((category, index) => ({
    user_id: userId,
    id: category.id,
    name: category.name,
    sort_order: index,
  }));

  const subcategoryRows: SubcategoryRow[] = categories.flatMap((category) =>
    category.subcategories.map((subcategory, index) => ({
      user_id: userId,
      id: subcategory.id,
      category_id: category.id,
      name: subcategory.name,
      sort_order: index,
    })),
  );

  const [
    { data: existingCategories, error: categoriesReadError },
    { data: existingSubcategories, error: subcategoriesReadError },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("user_id, id, name, sort_order")
      .eq("user_id", userId),
    supabase
      .from("subcategories")
      .select("user_id, id, category_id, name, sort_order")
      .eq("user_id", userId),
  ]);

  const readError = categoriesReadError ?? subcategoriesReadError;
  if (readError) {
    throw readError;
  }

  const nextCategoryIds = new Set(categoryRows.map((category) => category.id));
  const nextSubcategoryIds = new Set(
    subcategoryRows.map((subcategory) => subcategory.id),
  );

  const removedCategoryIds = (existingCategories ?? [])
    .filter((category) => !nextCategoryIds.has(category.id))
    .map((category) => category.id);
  const removedSubcategoryIds = (existingSubcategories ?? [])
    .filter((subcategory) => !nextSubcategoryIds.has(subcategory.id))
    .map((subcategory) => subcategory.id);

  if (removedSubcategoryIds.length > 0) {
    const { error } = await supabase
      .from("subcategories")
      .delete()
      .eq("user_id", userId)
      .in("id", removedSubcategoryIds);

    if (error) {
      throw error;
    }
  }

  if (removedCategoryIds.length > 0) {
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("user_id", userId)
      .in("id", removedCategoryIds);

    if (error) {
      throw error;
    }
  }

  if (categoryRows.length > 0) {
    const { error } = await supabase
      .from("categories")
      .upsert(categoryRows, { onConflict: "user_id,id" });

    if (error) {
      throw error;
    }
  }

  if (subcategoryRows.length > 0) {
    const { error } = await supabase
      .from("subcategories")
      .upsert(subcategoryRows, { onConflict: "user_id,id" });

    if (error) {
      throw error;
    }
  }
}

export async function saveFireSettings(
  userId: string,
  settings: FireSettings,
): Promise<void> {
  const { error } = await supabase
    .from("fire_settings")
    .upsert(mapFireSettingsToRow(userId, settings), {
      onConflict: "user_id,id",
    });

  if (error) {
    throw error;
  }
}
