import { MONTHS, type Category } from "../data/defaultCategories";

const REQUIRED_HEADERS = [
  "category_id",
  "category_name",
  "subcategory_id",
  "subcategory_name",
  ...MONTHS.map((month) => month.toLowerCase()),
] as const;

export interface ImportedYearValues {
  [subcategoryId: string]: number[];
}

function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function stringifyNumber(value: number): string {
  return Number.isFinite(value) && value !== 0 ? String(value) : "";
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (character === '"') {
      if (inQuotes && content[index + 1] === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && content[index + 1] === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (currentValue !== "" || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((value) => value.trim() !== ""));
}

function parseNumericCell(
  value: string,
  rowNumber: number,
  month: string,
): number {
  const trimmed = value.trim();
  if (trimmed === "") {
    return 0;
  }

  const normalized = trimmed.replace(/[$,\s]/g, "");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Row ${rowNumber}: ${month} must be a valid number.`);
  }

  return parsed;
}

function getSubcategoryLookup(categories: Category[]) {
  return categories.flatMap((category) =>
    category.subcategories.map((subcategory) => ({
      categoryId: category.id,
      categoryName: category.name,
      subcategoryId: subcategory.id,
      subcategoryName: subcategory.name,
    })),
  );
}

export function buildYearCsv(
  categories: Category[],
  getValue: (monthIndex: number, subcategoryId: string) => number,
): string {
  const header = REQUIRED_HEADERS.join(",");
  const rows = getSubcategoryLookup(categories).map((subcategory) => {
    const values = MONTHS.map((_, monthIndex) =>
      stringifyNumber(getValue(monthIndex, subcategory.subcategoryId)),
    );

    return [
      subcategory.categoryId,
      subcategory.categoryName,
      subcategory.subcategoryId,
      subcategory.subcategoryName,
      ...values,
    ]
      .map((value) => escapeCsvValue(value))
      .join(",");
  });

  return [header, ...rows].join("\r\n");
}

export function buildYearTemplateCsv(categories: Category[]): string {
  return buildYearCsv(categories, () => 0);
}

export function parseYearCsv(
  content: string,
  categories: Category[],
): ImportedYearValues {
  const normalizedContent = content.replace(/^\uFEFF/, "");
  const rows = parseCsv(normalizedContent);

  if (rows.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.");
  }

  const header = rows[0].map((value) => value.trim().toLowerCase());

  if (
    header.length !== REQUIRED_HEADERS.length ||
    REQUIRED_HEADERS.some((required, index) => header[index] !== required)
  ) {
    throw new Error(`CSV headers must match: ${REQUIRED_HEADERS.join(", ")}.`);
  }

  const validSubcategories = new Map(
    getSubcategoryLookup(categories).map((subcategory) => [
      subcategory.subcategoryId,
      subcategory,
    ]),
  );

  const importedValues: ImportedYearValues = {};

  rows.slice(1).forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    if (row.length !== REQUIRED_HEADERS.length) {
      throw new Error(
        `Row ${rowNumber}: expected ${REQUIRED_HEADERS.length} columns but found ${row.length}.`,
      );
    }

    const subcategoryId = row[2]?.trim();
    if (!subcategoryId) {
      throw new Error(`Row ${rowNumber}: subcategory_id is required.`);
    }

    const matchingSubcategory = validSubcategories.get(subcategoryId);
    if (!matchingSubcategory) {
      throw new Error(
        `Row ${rowNumber}: unknown subcategory_id \"${subcategoryId}\" for the current category setup.`,
      );
    }

    if (importedValues[subcategoryId]) {
      throw new Error(
        `Row ${rowNumber}: duplicate subcategory_id \"${subcategoryId}\".`,
      );
    }

    importedValues[subcategoryId] = MONTHS.map((month, monthIndex) =>
      parseNumericCell(row[monthIndex + 4] ?? "", rowNumber, month),
    );
  });

  validSubcategories.forEach((_, subcategoryId) => {
    if (!importedValues[subcategoryId]) {
      importedValues[subcategoryId] = MONTHS.map(() => 0);
    }
  });

  return importedValues;
}
