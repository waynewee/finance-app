import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type Category, MONTHS } from "../data/defaultCategories";

interface Props {
  year: number;
  categories: Category[];
  getValue: (year: number, monthIndex: number, subcategoryId: string) => number;
  setValue: (
    year: number,
    monthIndex: number,
    subcategoryId: string,
    value: number,
  ) => void;
  getMonthTotal: (year: number, monthIndex: number) => number;
  getCategoryMonthTotal: (
    year: number,
    monthIndex: number,
    categoryId: string,
  ) => number;
}

function formatNumber(n: number): string {
  if (n === 0) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function parseCurrency(s: string): number {
  const cleaned = s.replace(/[^0-9.-]/g, "");
  return cleaned === "" || cleaned === "-" ? 0 : parseFloat(cleaned) || 0;
}

export default function NetWorthTable({
  year,
  categories,
  getValue,
  setValue,
  getMonthTotal,
  getCategoryMonthTotal,
}: Props) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [editingCell, setEditingCell] = useState<{
    sub: string;
    month: number;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const toggleCategory = (catId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  };

  const startEdit = (subId: string, monthIndex: number, current: number) => {
    setEditingCell({ sub: subId, month: monthIndex });
    setEditValue(current === 0 ? "" : String(current));
  };

  const commitEdit = (subId: string, monthIndex: number) => {
    setValue(year, monthIndex, subId, parseCurrency(editValue));
    setEditingCell(null);
    setEditValue("");
  };

  const monthTotals = MONTHS.map((_, i) => getMonthTotal(year, i));
  const rowTotal = (subcategoryId: string) =>
    MONTHS.reduce((sum, _, i) => sum + getValue(year, i, subcategoryId), 0);
  const grandTotal = monthTotals.reduce((a, b) => a + b, 0);
  const catRowTotal = (catId: string) =>
    MONTHS.reduce(
      (sum, _, i) => sum + getCategoryMonthTotal(year, i, catId),
      0,
    );

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-700 min-w-48">
              Category
            </th>
            {MONTHS.map((m) => (
              <th
                key={m}
                className="px-3 py-3 text-right font-semibold text-gray-700 min-w-24"
              >
                {m}
              </th>
            ))}
            <th className="px-3 py-3 text-right font-semibold text-gray-700 min-w-24 bg-indigo-50">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const isCollapsed = collapsedCategories.has(cat.id);
            return (
              <>
                {/* Category header row */}
                <tr
                  key={cat.id}
                  className="bg-indigo-50 border-t border-gray-200 cursor-pointer hover:bg-indigo-100 transition-colors"
                  onClick={() => toggleCategory(cat.id)}
                >
                  <td className="sticky left-0 z-10 bg-indigo-50 px-4 py-2 font-semibold text-indigo-800 flex items-center gap-1.5">
                    {isCollapsed ? (
                      <ChevronRight size={14} className="shrink-0" />
                    ) : (
                      <ChevronDown size={14} className="shrink-0" />
                    )}
                    {cat.name}
                  </td>
                  {MONTHS.map((_, i) => {
                    const total = getCategoryMonthTotal(year, i, cat.id);
                    return (
                      <td
                        key={i}
                        className="px-3 py-2 text-right font-semibold text-indigo-700"
                      >
                        {total !== 0 ? formatNumber(total) : ""}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold text-indigo-700 bg-indigo-100">
                    {catRowTotal(cat.id) !== 0
                      ? formatNumber(catRowTotal(cat.id))
                      : ""}
                  </td>
                </tr>

                {/* Subcategory rows */}
                {!isCollapsed &&
                  cat.subcategories.map((sub) => (
                    <tr
                      key={sub.id}
                      className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-2 pl-8 text-gray-600">
                        {sub.name}
                      </td>
                      {MONTHS.map((_, monthIndex) => {
                        const val = getValue(year, monthIndex, sub.id);
                        const isEditing =
                          editingCell?.sub === sub.id &&
                          editingCell?.month === monthIndex;
                        return (
                          <td
                            key={monthIndex}
                            className="cursor-pointer px-1 py-1 text-right"
                            onClick={() =>
                              !isEditing && startEdit(sub.id, monthIndex, val)
                            }
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => commitEdit(sub.id, monthIndex)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    commitEdit(sub.id, monthIndex);
                                  if (e.key === "Escape") {
                                    setEditingCell(null);
                                    setEditValue("");
                                  }
                                }}
                                className="w-full text-right bg-indigo-50 border border-indigo-300 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-indigo-400 text-sm"
                              />
                            ) : (
                              <span className="block px-2 py-0.5 rounded cursor-pointer hover:bg-indigo-50 text-gray-700">
                                {val !== 0 ? (
                                  formatNumber(val)
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right text-gray-500 bg-gray-50">
                        {rowTotal(sub.id) !== 0
                          ? formatNumber(rowTotal(sub.id))
                          : ""}
                      </td>
                    </tr>
                  ))}
              </>
            );
          })}

          {/* Total row */}
          <tr className="border-t-2 border-indigo-300 bg-indigo-700 text-white font-bold">
            <td className="sticky left-0 z-10 bg-indigo-700 px-4 py-3">
              Net Worth
            </td>
            {monthTotals.map((total, i) => (
              <td key={i} className="px-3 py-3 text-right">
                {formatNumber(total)}
              </td>
            ))}
            <td className="px-3 py-3 text-right bg-indigo-800">
              {formatNumber(grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
