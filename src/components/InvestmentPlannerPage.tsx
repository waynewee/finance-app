import { useEffect, useMemo, useState } from "react";
import { Calculator, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useInvestmentPlanner } from "../hooks/useInvestmentPlanner";
import { type InvestmentAsset } from "../lib/investmentPlannerRepository";
import { fetchLiveQuotes } from "../lib/livePriceService";
import {
  HIDDEN_VALUE,
  maskDisplayValue,
  maskInlineNumbers,
} from "../lib/valueMasking";

interface Props {
  accountUserId: string;
  hideValues: boolean;
}

function createAssetId(): string {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createBlankAsset(): InvestmentAsset {
  return {
    id: createAssetId(),
    symbol: "",
    name: "",
    targetPercentage: 0,
    currentPrice: 0,
    shareIncrement: 1,
    quoteUpdatedAt: null,
    sortOrder: 0,
  };
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatShares(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function normalizeIncrement(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return value;
}

function roundDownToIncrement(value: number, increment: number): number {
  const normalizedIncrement = normalizeIncrement(increment);
  const rounded =
    Math.floor((value + 1e-10) / normalizedIncrement) * normalizedIncrement;
  return Number(rounded.toFixed(8));
}

function getQuoteAgeMs(quoteUpdatedAt: string | null): number | null {
  if (!quoteUpdatedAt) {
    return null;
  }

  const timestamp = new Date(quoteUpdatedAt).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Date.now() - timestamp;
}

function formatQuoteTimestamp(quoteUpdatedAt: string | null): string {
  const ageMs = getQuoteAgeMs(quoteUpdatedAt);
  if (ageMs == null) {
    return "No live quote yet";
  }

  const ageMinutes = Math.round(ageMs / 60000);
  if (ageMinutes < 1) {
    return "Updated just now";
  }

  if (ageMinutes < 60) {
    return `Updated ${ageMinutes}m ago`;
  }

  const ageHours = Math.round(ageMinutes / 60);
  if (ageHours < 24) {
    return `Updated ${ageHours}h ago`;
  }

  const ageDays = Math.round(ageHours / 24);
  return `Updated ${ageDays}d ago`;
}

function getQuoteBadge(quoteUpdatedAt: string | null): {
  label: string;
  className: string;
} {
  const ageMs = getQuoteAgeMs(quoteUpdatedAt);
  if (ageMs == null) {
    return {
      label: "manual",
      className: "border-gray-300 bg-gray-100 text-gray-600",
    };
  }

  const ageHours = ageMs / 3_600_000;
  if (ageHours <= 24) {
    return {
      label: "fresh",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  return {
    label: "stale",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  };
}

export default function InvestmentPlannerPage({
  accountUserId,
  hideValues,
}: Props) {
  const { assets, isLoading, error, saveAssets } =
    useInvestmentPlanner(accountUserId);
  const [draftAssets, setDraftAssets] = useState<InvestmentAsset[]>([]);
  const [monthlyBudget, setMonthlyBudget] = useState("0");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);

  useEffect(() => {
    setDraftAssets(assets);
  }, [assets]);

  const budget = parseNumber(monthlyBudget);
  const totalAllocation = useMemo(
    () => draftAssets.reduce((sum, asset) => sum + asset.targetPercentage, 0),
    [draftAssets],
  );
  const allocationGap = 100 - totalAllocation;
  const staleQuoteCount = useMemo(
    () =>
      draftAssets.filter(
        (asset) => getQuoteBadge(asset.quoteUpdatedAt).label === "stale",
      ).length,
    [draftAssets],
  );
  const manualPriceCount = useMemo(
    () =>
      draftAssets.filter(
        (asset) => getQuoteBadge(asset.quoteUpdatedAt).label === "manual",
      ).length,
    [draftAssets],
  );

  const plannerRows = useMemo(
    () =>
      draftAssets.map((asset) => {
        const plannedAmount = budget * (asset.targetPercentage / 100);
        const rawShares =
          asset.currentPrice > 0
            ? plannedAmount / asset.currentPrice
            : Number.NaN;
        const purchasableShares = Number.isFinite(rawShares)
          ? roundDownToIncrement(rawShares, asset.shareIncrement)
          : Number.NaN;
        const actualSpend =
          Number.isFinite(purchasableShares) && asset.currentPrice > 0
            ? purchasableShares * asset.currentPrice
            : 0;
        const leftoverAmount = Math.max(plannedAmount - actualSpend, 0);
        const plannedShares =
          asset.currentPrice > 0 ? purchasableShares : Number.NaN;

        return {
          ...asset,
          quoteBadge: getQuoteBadge(asset.quoteUpdatedAt),
          quoteTimestampText: formatQuoteTimestamp(asset.quoteUpdatedAt),
          plannedAmount,
          plannedShares,
          actualSpend,
          leftoverAmount,
        };
      }),
    [budget, draftAssets],
  );
  const displayCurrency = (value: number): string =>
    maskDisplayValue(formatCurrency(value), hideValues);
  const displayPercent = (value: number): string =>
    maskDisplayValue(formatPercent(value), hideValues);
  const displayShares = (value: number): string =>
    maskDisplayValue(formatShares(value), hideValues);

  const updateAsset = (
    assetId: string,
    field: keyof InvestmentAsset,
    value: string,
  ) => {
    setDraftAssets((prev) =>
      prev.map((asset) => {
        if (asset.id !== assetId) {
          return asset;
        }

        if (
          field === "targetPercentage" ||
          field === "currentPrice" ||
          field === "shareIncrement"
        ) {
          return {
            ...asset,
            [field]:
              field === "shareIncrement"
                ? normalizeIncrement(parseNumber(value))
                : parseNumber(value),
            ...(field === "currentPrice" ? { quoteUpdatedAt: null } : null),
          };
        }

        return { ...asset, [field]: value };
      }),
    );
    setSaveNotice(null);
  };

  const addAsset = () => {
    setDraftAssets((prev) => [
      ...prev,
      { ...createBlankAsset(), sortOrder: prev.length },
    ]);
    setSaveNotice(null);
  };

  const removeAsset = (assetId: string) => {
    setDraftAssets((prev) => prev.filter((asset) => asset.id !== assetId));
    setSaveNotice(null);
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await saveAssets(draftAssets);
      setSaveNotice("Planner assets saved.");
    } catch {
      setSaveNotice(null);
    } finally {
      setIsSaving(false);
    }
  };

  const refreshPrices = async (assetIds?: string[]) => {
    const candidateAssets = draftAssets.filter((asset) => {
      if (assetIds && !assetIds.includes(asset.id)) {
        return false;
      }

      return asset.symbol.trim().length > 0;
    });

    if (candidateAssets.length === 0) {
      setSaveNotice("Add a symbol before refreshing prices.");
      return;
    }

    setIsRefreshingPrices(true);

    try {
      const quotes = await fetchLiveQuotes(
        candidateAssets.map((asset) => asset.symbol),
      );
      const missingSymbols: string[] = [];
      const nextAssets = draftAssets.map((asset) => {
        const normalizedSymbol = asset.symbol.trim().toUpperCase();
        if (!normalizedSymbol || (assetIds && !assetIds.includes(asset.id))) {
          return asset;
        }

        const quote = quotes.get(normalizedSymbol);
        if (!quote) {
          missingSymbols.push(normalizedSymbol);
          return asset;
        }

        return {
          ...asset,
          currentPrice: quote.price,
          quoteUpdatedAt: new Date().toISOString(),
        };
      });

      setDraftAssets(nextAssets);
      await saveAssets(nextAssets);
      setSaveNotice(
        missingSymbols.length > 0
          ? `Updated prices. No quote found for: ${missingSymbols.join(", ")}.`
          : "Updated live prices.",
      );
    } catch (refreshError) {
      setSaveNotice(null);
      throw refreshError;
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Investment Planner
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Set your target asset mix, enter this month&apos;s budget, and
              calculate how many shares to buy.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block min-w-52">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Monthly investment budget
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={monthlyBudget}
                onChange={(event) => setMonthlyBudget(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
              />
            </label>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#2CA01C] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#248814] disabled:cursor-not-allowed disabled:bg-[#9FD792]"
            >
              <Save size={16} />
              {isSaving ? "Saving..." : "Save asset plan"}
            </button>

            <button
              onClick={() => void refreshPrices()}
              disabled={isRefreshingPrices}
              className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              <RefreshCw
                size={16}
                className={isRefreshingPrices ? "animate-spin" : undefined}
              />
              {isRefreshingPrices ? "Refreshing..." : "Refresh live prices"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Total planned budget
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {displayCurrency(budget)}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Allocation entered
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {displayPercent(totalAllocation)}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Remaining allocation
            </p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                allocationGap > 0
                  ? "text-amber-700"
                  : allocationGap < 0
                    ? "text-rose-700"
                    : "text-emerald-700"
              }`}
            >
              {displayPercent(allocationGap)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
            Fresh quotes:{" "}
            {hideValues
              ? HIDDEN_VALUE
              : draftAssets.length - staleQuoteCount - manualPriceCount}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
            Stale quotes: {hideValues ? HIDDEN_VALUE : staleQuoteCount}
          </span>
          <span className="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-gray-700">
            Manual prices: {hideValues ? HIDDEN_VALUE : manualPriceCount}
          </span>
        </div>

        {saveNotice ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {saveNotice}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500 shadow-sm">
          Loading planner assets...
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Asset Mix
              </h3>
              <p className="text-sm text-gray-500">
                Pull live prices by ticker symbol or override manually. Share
                counts assume fractional shares are allowed.
              </p>
            </div>
            <button
              onClick={addAsset}
              className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Plus size={16} />
              Add asset
            </button>
          </div>

          {plannerRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">
              Add your first asset, such as VOO or GLD, to start calculating
              monthly purchases.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">
                      Symbol
                    </th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">
                      Asset
                    </th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-700">
                      Target %
                    </th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-700">
                      Price
                    </th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-700">
                      Buy Step
                    </th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-700">
                      Buy Amount
                    </th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-700">
                      Shares
                    </th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-700">
                      Leftover
                    </th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-700">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plannerRows.map((asset) => (
                    <tr
                      key={asset.id}
                      className="border-b border-gray-100 last:border-b-0"
                    >
                      <td className="align-top px-3 py-2">
                        <input
                          value={asset.symbol}
                          onChange={(event) =>
                            updateAsset(
                              asset.id,
                              "symbol",
                              event.target.value.toUpperCase(),
                            )
                          }
                          placeholder="VOO"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                        />
                      </td>
                      <td className="align-top px-3 py-2">
                        <input
                          value={asset.name}
                          onChange={(event) =>
                            updateAsset(asset.id, "name", event.target.value)
                          }
                          placeholder="S&P 500 ETF"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                        />
                      </td>
                      <td className="align-top px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={asset.targetPercentage}
                          onChange={(event) =>
                            updateAsset(
                              asset.id,
                              "targetPercentage",
                              event.target.value,
                            )
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                        />
                      </td>
                      <td className="align-top px-3 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.0001"
                            value={asset.currentPrice}
                            onChange={(event) =>
                              updateAsset(
                                asset.id,
                                "currentPrice",
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                          />
                          <button
                            onClick={() => void refreshPrices([asset.id])}
                            title="Refresh this asset price"
                            className="rounded-lg border border-gray-300 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-[#1E7A18]"
                          >
                            <RefreshCw size={14} />
                          </button>
                        </div>
                        <div className="mt-1 flex items-center justify-end gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${asset.quoteBadge.className}`}
                          >
                            {asset.quoteBadge.label}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {asset.quoteTimestampText}
                          </span>
                        </div>
                      </td>
                      <td className="align-top px-3 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0.00000001"
                            step="0.0001"
                            value={asset.shareIncrement}
                            onChange={(event) =>
                              updateAsset(
                                asset.id,
                                "shareIncrement",
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                          />
                        </div>
                        <div className="mt-1 flex justify-end gap-1">
                          <button
                            onClick={() =>
                              updateAsset(asset.id, "shareIncrement", "1")
                            }
                            className="rounded-md border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                          >
                            Whole
                          </button>
                          <button
                            onClick={() =>
                              updateAsset(asset.id, "shareIncrement", "0.01")
                            }
                            className="rounded-md border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                          >
                            0.01
                          </button>
                          <button
                            onClick={() =>
                              updateAsset(asset.id, "shareIncrement", "0.0001")
                            }
                            className="rounded-md border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                          >
                            0.0001
                          </button>
                        </div>
                      </td>
                      <td className="align-top px-3 py-2 text-right font-medium text-gray-700">
                        <div className="px-3 py-2">
                          {displayCurrency(asset.plannedAmount)}
                        </div>
                      </td>
                      <td className="align-top px-3 py-2 text-right font-medium text-[#1E7A18]">
                        <div className="px-3 py-2">
                          {displayShares(asset.plannedShares)}
                        </div>
                      </td>
                      <td className="align-top px-3 py-2 text-right font-medium text-amber-700">
                        <div className="px-3 py-2">
                          {displayCurrency(asset.leftoverAmount)}
                        </div>
                      </td>
                      <td className="align-top px-3 py-2 text-right">
                        <div className="flex justify-end px-3 py-1">
                          <button
                            onClick={() => removeAsset(asset.id)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-rose-600 transition-colors hover:bg-rose-50"
                          >
                            <Trash2 size={14} />
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-4 text-sm text-gray-500 shadow-sm">
        <div className="flex items-start gap-3">
          <Calculator size={18} className="mt-0.5 text-gray-400" />
          <p>
            {maskInlineNumbers(
              `Example: with a monthly budget of ${formatCurrency(1000)} and VOO at 45% with a price of ${formatCurrency(550)} and a buy step of 1, the planner will target ${formatCurrency(450)} but round down to ${formatShares(0)} whole shares. If the buy step were 0.01, it would recommend about ${formatShares(roundDownToIncrement(450 / 550, 0.01))} shares instead.`,
              hideValues,
            )}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-sky-300 bg-sky-50 px-5 py-4 text-sm text-sky-800 shadow-sm">
        Yahoo Finance quotes are fetched client-side from ticker symbols like
        `VOO`, `GLD`, or `GC=F`. Prices older than 24 hours are marked stale,
        and manual edits are marked as manual.
      </div>
    </section>
  );
}
