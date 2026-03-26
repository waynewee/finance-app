export interface Subcategory {
  id: string;
  name: string;
  archived: boolean;
  isReferenceOnly: boolean;
}

export interface Category {
  id: string;
  name: string;
  archived: boolean;
  subcategories: Subcategory[];
}

interface NormalizedSubcategoryInput {
  id: string;
  name: string;
  archived?: boolean | null;
  isReferenceOnly?: boolean | null;
}

interface NormalizedCategoryInput {
  id: string;
  name: string;
  archived?: boolean | null;
  subcategories: NormalizedSubcategoryInput[];
}

export function normalizeCategory(category: NormalizedCategoryInput): Category {
  return {
    ...category,
    archived: category.archived ?? false,
    subcategories: category.subcategories.map((subcategory) => ({
      ...subcategory,
      archived: subcategory.archived ?? false,
      isReferenceOnly: subcategory.isReferenceOnly ?? false,
    })),
  };
}

export function normalizeCategories(categories: Category[]): Category[] {
  return categories.map((category) => normalizeCategory(category));
}

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "cash",
    name: "Cash & Bank",
    archived: false,
    subcategories: [
      {
        id: "checking",
        name: "Checking Account",
        archived: false,
        isReferenceOnly: false,
      },
      {
        id: "savings",
        name: "Savings Account",
        archived: false,
        isReferenceOnly: false,
      },
    ],
  },
  {
    id: "investments",
    name: "Investments",
    archived: false,
    subcategories: [
      {
        id: "brokerage",
        name: "Brokerage",
        archived: false,
        isReferenceOnly: false,
      },
      {
        id: "retirement_401k",
        name: "401(k)",
        archived: false,
        isReferenceOnly: false,
      },
      { id: "ira", name: "IRA", archived: false, isReferenceOnly: false },
    ],
  },
  {
    id: "property",
    name: "Property & Assets",
    archived: false,
    subcategories: [
      {
        id: "real_estate",
        name: "Real Estate",
        archived: false,
        isReferenceOnly: false,
      },
      {
        id: "vehicles",
        name: "Vehicles",
        archived: false,
        isReferenceOnly: false,
      },
    ],
  },
  {
    id: "liabilities",
    name: "Liabilities",
    archived: false,
    subcategories: [
      {
        id: "credit_cards",
        name: "Credit Cards",
        archived: false,
        isReferenceOnly: false,
      },
      {
        id: "mortgage",
        name: "Mortgage",
        archived: false,
        isReferenceOnly: false,
      },
      {
        id: "student_loans",
        name: "Student Loans",
        archived: false,
        isReferenceOnly: false,
      },
      {
        id: "other_loans",
        name: "Other Loans",
        archived: false,
        isReferenceOnly: false,
      },
    ],
  },
];

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
