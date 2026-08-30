import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db";
import { readJsonBody, sendError } from "./_lib/http";

interface CategoryInput {
  id: string;
  name: string;
  archived: boolean;
  subcategories: Array<{
    id: string;
    name: string;
    archived: boolean;
    isReferenceOnly: boolean;
  }>;
}

interface FireSettingsInput {
  annualSpendingGoal: number;
  preFireAnnualSpending: number;
  withdrawalRate: number;
  expectedAnnualReturn: number;
  timeToFireAlgorithm: string;
  annualBonusAmount: number;
  nonRecurringBonusAmount: number;
  jobLossMonthlySavingsReduction: number;
  jobLossMonthlySavingsReductionMonths: number | null;
  annualBonusMonthAdded: string | null;
  nonRecurringBonusMonthAdded: string | null;
  dateOfBirth: string | null;
  targetFireAge: number | null;
  predictedDeathAge: number | null;
  retirementContributionStopAge: number | null;
  retirementSystem: unknown;
}

async function handleGet(res: VercelResponse) {
  const [categoryRows, subcategoryRows, monthlyRows, fireSettingsRows] =
    await Promise.all([
      sql`select id, name, archived, sort_order from categories order by sort_order`,
      sql`select id, category_id, name, archived, is_reference_only, sort_order
          from subcategories order by sort_order`,
      sql`select year, month, subcategory_id, value from monthly_values`,
      sql`select * from fire_settings where id = 'primary'`,
    ]);

  res
    .status(200)
    .json({
      categoryRows,
      subcategoryRows,
      monthlyRows,
      fireSettingsRow: fireSettingsRows[0] ?? null,
    });
}

async function handleReplaceCategories(
  res: VercelResponse,
  categories: CategoryInput[],
) {
  const categoryIds = categories.map((category) => category.id);
  const subcategoryIds = categories.flatMap((category) =>
    category.subcategories.map((subcategory) => subcategory.id),
  );

  if (subcategoryIds.length > 0) {
    await sql`delete from subcategories where not (id = any(${subcategoryIds}))`;
  } else {
    await sql`delete from subcategories`;
  }

  if (categoryIds.length > 0) {
    await sql`delete from categories where not (id = any(${categoryIds}))`;
  } else {
    await sql`delete from categories`;
  }

  for (const [index, category] of categories.entries()) {
    await sql`
      insert into categories (id, name, archived, sort_order, updated_at)
      values (${category.id}, ${category.name}, ${category.archived}, ${index}, now())
      on conflict (id) do update set
        name = excluded.name,
        archived = excluded.archived,
        sort_order = excluded.sort_order,
        updated_at = now()
    `;

    for (const [subIndex, subcategory] of category.subcategories.entries()) {
      await sql`
        insert into subcategories
          (id, category_id, name, archived, is_reference_only, sort_order, updated_at)
        values
          (${subcategory.id}, ${category.id}, ${subcategory.name}, ${subcategory.archived}, ${subcategory.isReferenceOnly}, ${subIndex}, now())
        on conflict (id) do update set
          category_id = excluded.category_id,
          name = excluded.name,
          archived = excluded.archived,
          is_reference_only = excluded.is_reference_only,
          sort_order = excluded.sort_order,
          updated_at = now()
      `;
    }
  }

  res.status(200).json({ ok: true });
}

async function handleSaveMonthlyValue(
  res: VercelResponse,
  payload: {
    year: number;
    month: number;
    subcategoryId: string;
    value: number;
  },
) {
  const { year, month, subcategoryId, value } = payload;

  if (value === 0) {
    await sql`
      delete from monthly_values
      where year = ${year} and month = ${month} and subcategory_id = ${subcategoryId}
    `;
  } else {
    await sql`
      insert into monthly_values (year, month, subcategory_id, value, updated_at)
      values (${year}, ${month}, ${subcategoryId}, ${value}, now())
      on conflict (year, month, subcategory_id) do update set
        value = excluded.value,
        updated_at = now()
    `;
  }

  res.status(200).json({ ok: true });
}

async function handleReplaceYear(
  res: VercelResponse,
  payload: { year: number; valuesBySubcategory: Record<string, number[]> },
) {
  const { year, valuesBySubcategory } = payload;

  await sql`delete from monthly_values where year = ${year}`;

  for (const [subcategoryId, values] of Object.entries(valuesBySubcategory)) {
    for (const [month, value] of values.entries()) {
      if (!value) {
        continue;
      }

      await sql`
        insert into monthly_values (year, month, subcategory_id, value, updated_at)
        values (${year}, ${month}, ${subcategoryId}, ${value}, now())
      `;
    }
  }

  res.status(200).json({ ok: true });
}

async function handleSaveFireSettings(
  res: VercelResponse,
  settings: FireSettingsInput,
) {
  await sql`
    insert into fire_settings (
      id, annual_spending_goal, pre_fire_annual_spending, withdrawal_rate,
      expected_annual_return, time_to_fire_algorithm, annual_bonus_amount,
      non_recurring_bonus_amount, job_loss_monthly_savings_reduction,
      job_loss_monthly_savings_reduction_months, annual_bonus_month_added,
      non_recurring_bonus_month_added, date_of_birth, target_fire_age,
      predicted_death_age, contribution_stop_age, retirement_system, updated_at
    ) values (
      'primary', ${settings.annualSpendingGoal}, ${settings.preFireAnnualSpending}, ${settings.withdrawalRate},
      ${settings.expectedAnnualReturn}, ${settings.timeToFireAlgorithm}, ${settings.annualBonusAmount},
      ${settings.nonRecurringBonusAmount}, ${settings.jobLossMonthlySavingsReduction},
      ${settings.jobLossMonthlySavingsReductionMonths}, ${settings.annualBonusMonthAdded ? `${settings.annualBonusMonthAdded}-01` : null},
      ${settings.nonRecurringBonusMonthAdded ? `${settings.nonRecurringBonusMonthAdded}-01` : null}, ${settings.dateOfBirth}, ${settings.targetFireAge},
      ${settings.predictedDeathAge}, ${settings.retirementContributionStopAge}, ${JSON.stringify(settings.retirementSystem)}, now()
    )
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
      date_of_birth = excluded.date_of_birth,
      target_fire_age = excluded.target_fire_age,
      predicted_death_age = excluded.predicted_death_age,
      contribution_stop_age = excluded.contribution_stop_age,
      retirement_system = excluded.retirement_system,
      updated_at = now()
  `;

  res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      await handleGet(res);
      return;
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody<{ type: string; payload: unknown }>(req);

      switch (body.type) {
        case "categories":
          await handleReplaceCategories(res, body.payload as CategoryInput[]);
          return;
        case "monthly-value":
          await handleSaveMonthlyValue(
            res,
            body.payload as {
              year: number;
              month: number;
              subcategoryId: string;
              value: number;
            },
          );
          return;
        case "year":
          await handleReplaceYear(
            res,
            body.payload as {
              year: number;
              valuesBySubcategory: Record<string, number[]>;
            },
          );
          return;
        case "fire-settings":
          await handleSaveFireSettings(res, body.payload as FireSettingsInput);
          return;
        default:
          sendError(res, 400, `Unknown update type: ${body.type}`);
          return;
      }
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
