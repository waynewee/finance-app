import { DEFAULT_CATEGORIES, type Category } from "../data/defaultCategories";

export interface CategoryRow {
  id: string;
  name: string;
  archived: boolean;
  sort_order: number;
}

export interface SubcategoryRow {
  id: string;
  category_id: string;
  name: string;
  archived: boolean;
  is_reference_only: boolean;
  sort_order: number;
}

export interface MonthlyValueRow {
  id: string;
  year: number;
  month: number;
  subcategory_id: string;
  value: number;
  updated_at: string;
}

export interface FireSettingsRow {
  id: string;
  annual_spending_goal: number;
  withdrawal_rate: number;
  expected_annual_return: number;
  job_loss_monthly_savings_reduction_months?: number | null;
  monthly_contribution: number;
  monthly_income?: number | null;
  retirement_system?: unknown;
  current_age?: number | null;
  date_of_birth?: string | null;
  target_fire_age: number | null;
  updated_at: string;
}

type TableMap = {
  categories: CategoryRow;
  subcategories: SubcategoryRow;
  monthly_values: MonthlyValueRow;
  fire_settings: FireSettingsRow;
};

type TableName = keyof TableMap;
type Filter =
  | { type: "eq"; column: string; value: unknown }
  | { type: "in"; column: string; values: unknown[] };

interface LocalDatabaseState {
  categories: CategoryRow[];
  subcategories: SubcategoryRow[];
  monthly_values: MonthlyValueRow[];
  fire_settings: FireSettingsRow[];
}

interface QueryResult<T> {
  data: T;
  error: Error | null;
}

const DB_KEY = "networth_local_supabase_db";
const LEGACY_DATA_KEY = "networth_monthly_data";
const LEGACY_CATEGORIES_KEY = "networth_categories";

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptyDatabase(): LocalDatabaseState {
  return {
    categories: [],
    subcategories: [],
    monthly_values: [],
    fire_settings: [],
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function createMonthlyValueId(
  year: number,
  month: number,
  subcategoryId: string,
): string {
  return `${year}-${month}-${subcategoryId}`;
}

function mapCategoriesToRows(
  categories: Category[],
): Pick<LocalDatabaseState, "categories" | "subcategories"> {
  return {
    categories: categories.map((category, index) => ({
      id: category.id,
      name: category.name,
      archived: category.archived ?? false,
      sort_order: index,
    })),
    subcategories: categories.flatMap((category) =>
      category.subcategories.map((subcategory, index) => ({
        id: subcategory.id,
        category_id: category.id,
        name: subcategory.name,
        archived: subcategory.archived ?? false,
        is_reference_only: subcategory.isReferenceOnly ?? false,
        sort_order: index,
      })),
    ),
  };
}

function migrateLegacyDatabase(): LocalDatabaseState {
  const categoriesRaw = localStorage.getItem(LEGACY_CATEGORIES_KEY);
  const monthlyDataRaw = localStorage.getItem(LEGACY_DATA_KEY);

  const legacyCategories = categoriesRaw
    ? (JSON.parse(categoriesRaw) as Category[])
    : DEFAULT_CATEGORIES;
  const legacyMonthlyData = monthlyDataRaw
    ? (JSON.parse(monthlyDataRaw) as Record<
        string,
        Record<number, Record<string, number>>
      >)
    : {};

  const { categories, subcategories } = mapCategoriesToRows(legacyCategories);
  const monthly_values: MonthlyValueRow[] = [];

  Object.entries(legacyMonthlyData).forEach(([year, months]) => {
    Object.entries(months).forEach(([month, values]) => {
      Object.entries(values).forEach(([subcategoryId, value]) => {
        if (value === 0) {
          return;
        }

        const numericYear = Number(year);
        const numericMonth = Number(month);
        monthly_values.push({
          id: createMonthlyValueId(numericYear, numericMonth, subcategoryId),
          year: numericYear,
          month: numericMonth,
          subcategory_id: subcategoryId,
          value,
          updated_at: new Date().toISOString(),
        });
      });
    });
  });

  return {
    categories,
    subcategories,
    monthly_values,
    fire_settings: [],
  };
}

function readDatabase(): LocalDatabaseState {
  if (!isBrowser()) {
    return emptyDatabase();
  }

  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      return JSON.parse(raw) as LocalDatabaseState;
    }

    const migrated = migrateLegacyDatabase();
    writeDatabase(migrated);
    return migrated;
  } catch {
    return emptyDatabase();
  }
}

function writeDatabase(state: LocalDatabaseState): void {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(DB_KEY, JSON.stringify(state));
}

function applyFilters<TRow extends object>(
  rows: TRow[],
  filters: Filter[],
): TRow[] {
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = (row as Record<string, unknown>)[filter.column];
      if (filter.type === "eq") {
        return value === filter.value;
      }

      return filter.values.includes(value);
    }),
  );
}

function applyOrderToRows<TRow extends object>(
  rows: TRow[],
  orderBy?: { column: string; ascending: boolean },
): TRow[] {
  if (!orderBy) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    const leftValue = (left as Record<string, unknown>)[orderBy.column];
    const rightValue = (right as Record<string, unknown>)[orderBy.column];

    if (leftValue === rightValue) {
      return 0;
    }

    if (leftValue == null) {
      return orderBy.ascending ? -1 : 1;
    }

    if (rightValue == null) {
      return orderBy.ascending ? 1 : -1;
    }

    if (leftValue < rightValue) {
      return orderBy.ascending ? -1 : 1;
    }

    return orderBy.ascending ? 1 : -1;
  });
}

class LocalQuery<TTable extends TableName> implements PromiseLike<
  QueryResult<TableMap[TTable][]>
> {
  private readonly table: TTable;
  private mode: "select" | "upsert" | "delete" = "select";
  private filters: Filter[] = [];
  private orderBy?: { column: string; ascending: boolean };
  private payload: TableMap[TTable][] = [];

  constructor(table: TTable) {
    this.table = table;
  }

  select(): this {
    this.mode = "select";
    return this;
  }

  upsert(values: TableMap[TTable] | TableMap[TTable][]): this {
    this.mode = "upsert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  delete(): this {
    this.mode = "delete";
    return this;
  }

  eq(column: keyof TableMap[TTable] & string, value: unknown): this {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  in(column: keyof TableMap[TTable] & string, values: unknown[]): this {
    this.filters.push({ type: "in", column, values });
    return this;
  }

  order(
    column: keyof TableMap[TTable] & string,
    options?: { ascending?: boolean },
  ): this {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  async execute(): Promise<QueryResult<TableMap[TTable][]>> {
    try {
      const database = readDatabase();
      const tableRows = cloneValue(database[this.table]) as TableMap[TTable][];

      if (this.mode === "select") {
        const filtered = applyOrderToRows(
          applyFilters(tableRows, this.filters),
          this.orderBy,
        );
        return {
          data: cloneValue(filtered),
          error: null,
        };
      }

      if (this.mode === "upsert") {
        const nextRows = cloneValue(database[this.table]) as TableMap[TTable][];

        this.payload.forEach((row) => {
          const rowId = (row as { id: string }).id;
          const existingIndex = nextRows.findIndex(
            (existingRow) => (existingRow as { id: string }).id === rowId,
          );
          if (existingIndex >= 0) {
            nextRows[existingIndex] = row;
          } else {
            nextRows.push(row);
          }
        });

        database[this.table] = nextRows as LocalDatabaseState[TTable];
        writeDatabase(database);

        return {
          data: cloneValue(this.payload),
          error: null,
        };
      }

      const remainingRows = cloneValue(
        database[this.table],
      ) as TableMap[TTable][];
      const deletedRows = applyFilters(remainingRows, this.filters);
      const deletedIds = new Set(
        deletedRows.map((row) => (row as { id: string }).id),
      );
      const keptRows = remainingRows.filter(
        (row) => !deletedIds.has((row as { id: string }).id),
      );

      database[this.table] = keptRows as LocalDatabaseState[TTable];
      writeDatabase(database);

      return {
        data: cloneValue(deletedRows),
        error: null,
      };
    } catch (error) {
      return {
        data: [] as TableMap[TTable][],
        error:
          error instanceof Error
            ? error
            : new Error("Local persistence failed."),
      };
    }
  }

  then<TResult1 = QueryResult<TableMap[TTable][]>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: QueryResult<TableMap[TTable][]>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const localSupabase = {
  from<TTable extends TableName>(table: TTable): LocalQuery<TTable> {
    return new LocalQuery(table);
  },
};

export { createMonthlyValueId };
