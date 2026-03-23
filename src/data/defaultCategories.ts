export interface Subcategory {
  id: string;
  name: string;
  archived: boolean;
}

export interface Category {
  id: string;
  name: string;
  archived: boolean;
  subcategories: Subcategory[];
}

export function normalizeCategory(
  category: Omit<Category, "archived"> & {
    archived?: boolean | null;
  },
): Category {
  return {
    ...category,
    archived: category.archived ?? false,
    subcategories: category.subcategories.map((subcategory) => ({
      ...subcategory,
      archived: subcategory.archived ?? false,
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
      { id: "checking", name: "Checking Account", archived: false },
      { id: "savings", name: "Savings Account", archived: false },
    ],
  },
  {
    id: "investments",
    name: "Investments",
    archived: false,
    subcategories: [
      { id: "brokerage", name: "Brokerage", archived: false },
      { id: "retirement_401k", name: "401(k)", archived: false },
      { id: "ira", name: "IRA", archived: false },
    ],
  },
  {
    id: "property",
    name: "Property & Assets",
    archived: false,
    subcategories: [
      { id: "real_estate", name: "Real Estate", archived: false },
      { id: "vehicles", name: "Vehicles", archived: false },
    ],
  },
  {
    id: "liabilities",
    name: "Liabilities",
    archived: false,
    subcategories: [
      { id: "credit_cards", name: "Credit Cards", archived: false },
      { id: "mortgage", name: "Mortgage", archived: false },
      { id: "student_loans", name: "Student Loans", archived: false },
      { id: "other_loans", name: "Other Loans", archived: false },
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
