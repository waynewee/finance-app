export interface Subcategory {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  subcategories: Subcategory[];
}

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "cash",
    name: "Cash & Bank",
    subcategories: [
      { id: "checking", name: "Checking Account" },
      { id: "savings", name: "Savings Account" },
    ],
  },
  {
    id: "investments",
    name: "Investments",
    subcategories: [
      { id: "brokerage", name: "Brokerage" },
      { id: "retirement_401k", name: "401(k)" },
      { id: "ira", name: "IRA" },
    ],
  },
  {
    id: "property",
    name: "Property & Assets",
    subcategories: [
      { id: "real_estate", name: "Real Estate" },
      { id: "vehicles", name: "Vehicles" },
    ],
  },
  {
    id: "liabilities",
    name: "Liabilities",
    subcategories: [
      { id: "credit_cards", name: "Credit Cards" },
      { id: "mortgage", name: "Mortgage" },
      { id: "student_loans", name: "Student Loans" },
      { id: "other_loans", name: "Other Loans" },
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
