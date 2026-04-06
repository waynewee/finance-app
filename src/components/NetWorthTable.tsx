import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type Category, MONTHS } from "../data/defaultCategories";
import { HIDDEN_VALUE } from "../lib/valueMasking";

interface CellPosition {
  sub: string;
  month: number;
}

interface Props {
  hideValues: boolean;
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
  hideValues,
  year,
  categories,
  getValue,
  setValue,
  getMonthTotal,
  getCategoryMonthTotal,
}: Props) {
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editValue, setEditValue] = useState("");
  const visibleCategories = useMemo(
    () => categories.filter((category) => !category.archived),
    [categories],
  );

  const visibleSubcategories = useMemo(
    () =>
      visibleCategories.flatMap((category) =>
        collapsedCategories.has(category.id)
          ? []
          : category.subcategories.filter(
              (subcategory) => !subcategory.archived,
            ),
      ),
    [visibleCategories, collapsedCategories],
  );

  const toggleCategory = (catId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  };

  const startEdit = (subId: string, monthIndex: number, current: number) => {
    if (hideValues) {
      return;
    }

    const nextCell = { sub: subId, month: monthIndex };
    setSelectedCell(nextCell);
    setEditingCell(nextCell);
    setEditValue(current === 0 ? "" : String(current));
  };

  const commitEdit = (
    subId: string,
    monthIndex: number,
    nextValue = editValue,
  ) => {
    setValue(year, monthIndex, subId, parseCurrency(nextValue));
    setEditingCell(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const moveSelection = (
    currentCell: CellPosition,
    rowOffset: number,
    columnOffset: number,
    options?: { startEditing?: boolean },
  ) => {
    const currentRowIndex = visibleSubcategories.findIndex(
      (subcategory) => subcategory.id === currentCell.sub,
    );

    if (currentRowIndex === -1) {
      return;
    }

    const nextRowIndex = Math.min(
      Math.max(currentRowIndex + rowOffset, 0),
      visibleSubcategories.length - 1,
    );
    const nextMonthIndex = Math.min(
      Math.max(currentCell.month + columnOffset, 0),
      MONTHS.length - 1,
    );
    const nextSubcategory = visibleSubcategories[nextRowIndex];

    if (!nextSubcategory) {
      return;
    }

    const nextCell = { sub: nextSubcategory.id, month: nextMonthIndex };
    setSelectedCell(nextCell);

    if (options?.startEditing) {
      startEdit(
        nextSubcategory.id,
        nextMonthIndex,
        getValue(year, nextMonthIndex, nextSubcategory.id),
      );
      return;
    }

    setEditingCell(null);
  };

  useEffect(() => {
    if (!selectedCell || editingCell) {
      return;
    }

    const activeKey = `${selectedCell.sub}-${selectedCell.month}`;
    cellRefs.current[activeKey]?.focus();
  }, [editingCell, selectedCell]);

  useEffect(() => {
    if (visibleSubcategories.length === 0) {
      setSelectedCell(null);
      setEditingCell(null);
      setEditValue("");
      return;
    }

    if (
      selectedCell &&
      visibleSubcategories.some(
        (subcategory) => subcategory.id === selectedCell.sub,
      )
    ) {
      return;
    }

    setSelectedCell({ sub: visibleSubcategories[0].id, month: 0 });
    setEditingCell(null);
    setEditValue("");
  }, [selectedCell, visibleSubcategories]);

  useEffect(() => {
    if (!hideValues) {
      return;
    }

    setEditingCell(null);
    setEditValue("");
  }, [hideValues]);

  const monthTotals = MONTHS.map((_, i) => getMonthTotal(year, i));
  const rowTotal = (subcategoryId: string) =>
    MONTHS.reduce((sum, _, i) => sum + getValue(year, i, subcategoryId), 0);
  const grandTotal = monthTotals.reduce((a, b) => a + b, 0);
  const catRowTotal = (catId: string) =>
    MONTHS.reduce(
      (sum, _, i) => sum + getCategoryMonthTotal(year, i, catId),
      0,
    );
  const displayTableValue = (value: number): string =>
    hideValues ? HIDDEN_VALUE : formatNumber(value);

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
            <th className="min-w-24 bg-[#EEF9EA] px-3 py-3 text-right font-semibold text-gray-700">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Total row */}
          <tr className="border-t-2 border-[#9FD792] bg-[#2CA01C] font-bold text-white">
            <td className="sticky left-0 z-10 bg-[#2CA01C] px-4 py-3">
              FIRE Net Worth
            </td>
            {monthTotals.map((total, i) => (
              <td key={i} className="px-3 py-3 text-right">
                {displayTableValue(total)}
              </td>
            ))}
            <td className="bg-[#248814] px-3 py-3 text-right">
              {displayTableValue(grandTotal)}
            </td>
          </tr>

          {visibleCategories.map((cat) => {
            const isCollapsed = collapsedCategories.has(cat.id);
            return (
              <Fragment key={cat.id}>
                {/* Category header row */}
                <tr
                  className="cursor-pointer border-t border-gray-200 bg-[#EEF9EA] transition-colors hover:bg-[#E1F4DB]"
                  onClick={() => toggleCategory(cat.id)}
                >
                  <td className="sticky left-0 z-10 flex items-center gap-1.5 bg-[#EEF9EA] px-4 py-2 font-semibold text-[#1E7A18]">
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
                        className="px-3 py-2 text-right font-semibold text-[#1E7A18]"
                      >
                        {displayTableValue(total)}
                      </td>
                    );
                  })}
                  <td className="bg-[#E1F4DB] px-3 py-2 text-right font-semibold text-[#1E7A18]">
                    {displayTableValue(catRowTotal(cat.id))}
                  </td>
                </tr>

                {/* Subcategory rows */}
                {!isCollapsed &&
                  cat.subcategories
                    .filter((sub) => !sub.archived)
                    .map((sub) => (
                      <tr
                        key={sub.id}
                        className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="sticky left-0 z-10 bg-white px-4 py-2 pl-8 text-gray-600">
                          <div className="flex items-center gap-2">
                            <span>{sub.name}</span>
                            {sub.isReferenceOnly ? (
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                                Ref
                              </span>
                            ) : null}
                          </div>
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
                                    if (e.key === "ArrowRight") {
                                      e.preventDefault();
                                      commitEdit(sub.id, monthIndex);
                                      moveSelection(
                                        { sub: sub.id, month: monthIndex },
                                        0,
                                        1,
                                        { startEditing: true },
                                      );
                                    }
                                    if (e.key === "ArrowLeft") {
                                      e.preventDefault();
                                      commitEdit(sub.id, monthIndex);
                                      moveSelection(
                                        { sub: sub.id, month: monthIndex },
                                        0,
                                        -1,
                                        { startEditing: true },
                                      );
                                    }
                                    if (e.key === "ArrowDown") {
                                      e.preventDefault();
                                      commitEdit(sub.id, monthIndex);
                                      moveSelection(
                                        { sub: sub.id, month: monthIndex },
                                        1,
                                        0,
                                        { startEditing: true },
                                      );
                                    }
                                    if (e.key === "ArrowUp") {
                                      e.preventDefault();
                                      commitEdit(sub.id, monthIndex);
                                      moveSelection(
                                        { sub: sub.id, month: monthIndex },
                                        -1,
                                        0,
                                        { startEditing: true },
                                      );
                                    }
                                    if (e.key === "Escape") {
                                      cancelEdit();
                                    }
                                  }}
                                  className="w-full rounded border border-[#9FD792] bg-[#EEF9EA] px-2 py-0.5 text-right text-sm outline-none focus:ring-2 focus:ring-[#2CA01C]/20"
                                />
                              ) : (
                                <button
                                  ref={(element) => {
                                    cellRefs.current[
                                      `${sub.id}-${monthIndex}`
                                    ] = element;
                                  }}
                                  type="button"
                                  onClick={() => {
                                    if (
                                      selectedCell?.sub === sub.id &&
                                      selectedCell?.month === monthIndex
                                    ) {
                                      startEdit(sub.id, monthIndex, val);
                                      return;
                                    }

                                    setSelectedCell({
                                      sub: sub.id,
                                      month: monthIndex,
                                    });
                                  }}
                                  onDoubleClick={() =>
                                    startEdit(sub.id, monthIndex, val)
                                  }
                                  onFocus={() =>
                                    setSelectedCell({
                                      sub: sub.id,
                                      month: monthIndex,
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      startEdit(sub.id, monthIndex, val);
                                    }
                                    if (e.key === "ArrowRight") {
                                      e.preventDefault();
                                      moveSelection(
                                        { sub: sub.id, month: monthIndex },
                                        0,
                                        1,
                                      );
                                    }
                                    if (e.key === "ArrowLeft") {
                                      e.preventDefault();
                                      moveSelection(
                                        { sub: sub.id, month: monthIndex },
                                        0,
                                        -1,
                                      );
                                    }
                                    if (e.key === "ArrowDown") {
                                      e.preventDefault();
                                      moveSelection(
                                        { sub: sub.id, month: monthIndex },
                                        1,
                                        0,
                                      );
                                    }
                                    if (e.key === "ArrowUp") {
                                      e.preventDefault();
                                      moveSelection(
                                        { sub: sub.id, month: monthIndex },
                                        -1,
                                        0,
                                      );
                                    }
                                  }}
                                  aria-label={`${sub.name} ${MONTHS[monthIndex]}`}
                                  className={`block w-full rounded px-2 py-0.5 text-right text-gray-700 outline-none transition-colors hover:bg-[#EEF9EA] focus:bg-[#EEF9EA] ${
                                    selectedCell?.sub === sub.id &&
                                    selectedCell?.month === monthIndex
                                      ? "ring-2 ring-[#2CA01C]/30"
                                      : ""
                                  }`}
                                >
                                  {hideValues ? (
                                    HIDDEN_VALUE
                                  ) : val !== 0 ? (
                                    formatNumber(val)
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </button>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right text-gray-500 bg-gray-50">
                          {sub.isReferenceOnly ? (
                            <span className="text-sky-600">Ref</span>
                          ) : (
                            displayTableValue(rowTotal(sub.id))
                          )}
                        </td>
                      </tr>
                    ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
