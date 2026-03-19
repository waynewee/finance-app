import { useState } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { type Category, type Subcategory } from "../data/defaultCategories";

interface Props {
  categories: Category[];
  onUpdate: (categories: Category[]) => void;
  onClose: () => void;
}

function generateId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") +
    "_" +
    Date.now()
  );
}

export default function CategoryConfig({
  categories,
  onUpdate,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<Category[]>(structuredClone(categories));
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    new Set(draft.map((c) => c.id)),
  );
  const [newCatName, setNewCatName] = useState("");
  const [newSubNames, setNewSubNames] = useState<Record<string, string>>({});

  const toggleCat = (id: string) =>
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const addCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    setDraft((prev) => [
      ...prev,
      { id: generateId(name), name, subcategories: [] },
    ]);
    setNewCatName("");
  };

  const removeCategory = (catId: string) =>
    setDraft((prev) => prev.filter((c) => c.id !== catId));

  const updateCategoryName = (catId: string, name: string) =>
    setDraft((prev) => prev.map((c) => (c.id === catId ? { ...c, name } : c)));

  const addSubcategory = (catId: string) => {
    const name = (newSubNames[catId] ?? "").trim();
    if (!name) return;
    const newSub: Subcategory = { id: generateId(name), name };
    setDraft((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, subcategories: [...c.subcategories, newSub] }
          : c,
      ),
    );
    setNewSubNames((prev) => ({ ...prev, [catId]: "" }));
  };

  const removeSubcategory = (catId: string, subId: string) =>
    setDraft((prev) =>
      prev.map((c) =>
        c.id === catId
          ? {
              ...c,
              subcategories: c.subcategories.filter((s) => s.id !== subId),
            }
          : c,
      ),
    );

  const updateSubcategoryName = (catId: string, subId: string, name: string) =>
    setDraft((prev) =>
      prev.map((c) =>
        c.id === catId
          ? {
              ...c,
              subcategories: c.subcategories.map((s) =>
                s.id === subId ? { ...s, name } : s,
              ),
            }
          : c,
      ),
    );

  const moveCategoryUp = (idx: number) => {
    if (idx === 0) return;
    setDraft((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveCategoryDown = (idx: number) => {
    if (idx === draft.length - 1) return;
    setDraft((prev) => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const moveSubUp = (catId: string, subIdx: number) => {
    if (subIdx === 0) return;
    setDraft((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        const subs = [...c.subcategories];
        [subs[subIdx - 1], subs[subIdx]] = [subs[subIdx], subs[subIdx - 1]];
        return { ...c, subcategories: subs };
      }),
    );
  };

  const moveSubDown = (catId: string, subIdx: number, subLen: number) => {
    if (subIdx === subLen - 1) return;
    setDraft((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        const subs = [...c.subcategories];
        [subs[subIdx], subs[subIdx + 1]] = [subs[subIdx + 1], subs[subIdx]];
        return { ...c, subcategories: subs };
      }),
    );
  };

  const handleSave = () => {
    onUpdate(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Configure Categories
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {draft.map((cat, catIdx) => (
            <div
              key={cat.id}
              className="border border-gray-200 rounded-xl overflow-hidden"
            >
              {/* Category row */}
              <div className="flex items-center gap-2 bg-[#EEF9EA] px-3 py-2">
                <button
                  title="Drag to reorder"
                  className="text-gray-400 cursor-grab active:cursor-grabbing flex flex-col gap-0.5"
                  onClick={() => {}}
                >
                  <GripVertical size={16} />
                </button>
                <div className="flex gap-1 flex-col">
                  <button
                    onClick={() => moveCategoryUp(catIdx)}
                    disabled={catIdx === 0}
                    className="text-xs leading-none text-gray-400 hover:text-[#1E7A18] disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveCategoryDown(catIdx)}
                    disabled={catIdx === draft.length - 1}
                    className="text-xs leading-none text-gray-400 hover:text-[#1E7A18] disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                <input
                  value={cat.name}
                  onChange={(e) => updateCategoryName(cat.id, e.target.value)}
                  className="flex-1 border-b border-transparent bg-transparent py-0.5 font-semibold text-[#1E7A18] outline-none focus:border-[#2CA01C]"
                />
                <button
                  onClick={() => toggleCat(cat.id)}
                  className="text-[#57B44B] hover:text-[#1E7A18]"
                >
                  {expandedCats.has(cat.id) ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
                <button
                  onClick={() => removeCategory(cat.id)}
                  className="text-red-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {/* Subcategories */}
              {expandedCats.has(cat.id) && (
                <div className="divide-y divide-gray-100 px-3 py-2 space-y-1">
                  {cat.subcategories.map((sub, subIdx) => (
                    <div key={sub.id} className="flex items-center gap-2 py-1">
                      <div className="flex gap-0.5 flex-col ml-2">
                        <button
                          onClick={() => moveSubUp(cat.id, subIdx)}
                          disabled={subIdx === 0}
                          className="text-xs leading-none text-gray-300 hover:text-[#2CA01C] disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() =>
                            moveSubDown(
                              cat.id,
                              subIdx,
                              cat.subcategories.length,
                            )
                          }
                          disabled={subIdx === cat.subcategories.length - 1}
                          className="text-xs leading-none text-gray-300 hover:text-[#2CA01C] disabled:opacity-30"
                        >
                          ▼
                        </button>
                      </div>
                      <input
                        value={sub.name}
                        onChange={(e) =>
                          updateSubcategoryName(cat.id, sub.id, e.target.value)
                        }
                        className="flex-1 border-b border-transparent bg-transparent py-0.5 text-sm text-gray-700 outline-none focus:border-[#9FD792]"
                      />
                      <button
                        onClick={() => removeSubcategory(cat.id, sub.id)}
                        className="text-red-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}

                  {/* Add subcategory */}
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      placeholder="New sub-category..."
                      value={newSubNames[cat.id] ?? ""}
                      onChange={(e) =>
                        setNewSubNames((prev) => ({
                          ...prev,
                          [cat.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" && addSubcategory(cat.id)
                      }
                      className="flex-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm focus:border-[#2CA01C] focus:outline-none"
                    />
                    <button
                      onClick={() => addSubcategory(cat.id)}
                      className="text-[#2CA01C] transition-colors hover:text-[#1E7A18]"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add category */}
          <div className="flex items-center gap-2">
            <input
              placeholder="New category name..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              className="flex-1 rounded-xl border border-dashed border-[#9FD792] px-4 py-2 text-sm focus:border-[#2CA01C] focus:outline-none"
            />
            <button
              onClick={addCategory}
              className="flex items-center gap-1 rounded-xl bg-[#2CA01C] px-3 py-2 text-sm text-white transition-colors hover:bg-[#248814]"
            >
              <Plus size={15} />
              Add
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-xl bg-[#2CA01C] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#248814]"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
