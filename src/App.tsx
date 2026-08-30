import { useRef, useState } from "react";
import {
  Download,
  Lock,
  Settings,
  ChevronLeft,
  ChevronRight,
  Upload,
  Flame,
  Eye,
  EyeOff,
} from "lucide-react";
import { useValueLock } from "./hooks/useValueLock";
import { useNetWorthData } from "./hooks/useNetWorthData";
import NetWorthTable from "./components/NetWorthTable";
import CategoryConfig from "./components/CategoryConfig";
import ProgressSummary from "./components/ProgressSummary";
import FireSummaryCards from "./components/FireSummaryCards";
import ValueLockSettingsModal from "./components/ValueLockSettingsModal";
import ValueUnlockModal from "./components/ValueUnlockModal";
import { buildYearCsv, parseYearCsv } from "./lib/netWorthCsv";

function App() {
  const currentYear = new Date().getFullYear();
  const [tableYear, setTableYear] = useState(currentYear);
  const [showConfig, setShowConfig] = useState(false);
  const [showValueLockSettings, setShowValueLockSettings] = useState(false);
  const [showValueUnlockModal, setShowValueUnlockModal] = useState(false);
  const [hideValues, setHideValues] = useState(true);
  const [csvNotice, setCsvNotice] = useState<string | null>(null);
  const [valueLockNotice, setValueLockNotice] = useState<string | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const {
    hasValueLockPassword,
    isValueLockStatusLoading,
    error: valueLockError,
    saveValueLockPassword,
    clearValueLock,
    verifyValueLock,
  } = useValueLock();

  const {
    categories,
    isLoading,
    error,
    fireSettings,
    getValue,
    setValue,
    getMonthTotal,
    getCategoryMonthTotal,
    getPreviousSnapshot,
    getNetWorthSnapshots,
    updateCategories,
    updateFireSettings,
    replaceYearData,
  } = useNetWorthData();

  const downloadCsvFile = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csv = buildYearCsv(categories, (monthIndex, subcategoryId) =>
      getValue(tableYear, monthIndex, subcategoryId),
    );

    downloadCsvFile(`net-worth-${tableYear}.csv`, csv);
    setCsvNotice(`Exported ${tableYear} net worth table as CSV.`);
  };

  const handleImportCsv = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsImportingCsv(true);

    try {
      const content = await file.text();
      const importedValues = parseYearCsv(content, categories);
      await replaceYearData(tableYear, importedValues);
      setCsvNotice(`Imported CSV into the ${tableYear} net worth table.`);
    } catch (importError) {
      setCsvNotice(
        importError instanceof Error
          ? importError.message
          : "Failed to import CSV.",
      );
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleShowValuesRequest = () => {
    setValueLockNotice(null);

    if (!hideValues) {
      setHideValues(true);
      setShowValueUnlockModal(false);
      return;
    }

    if (isValueLockStatusLoading) {
      return;
    }

    if (!hasValueLockPassword) {
      setShowValueLockSettings(true);
      setValueLockNotice("Set a value lock password before showing values.");
      return;
    }

    setShowValueUnlockModal(true);
  };

  const handleUnlockValues = async (password: string) => {
    const isValidPassword = await verifyValueLock(password);

    if (!isValidPassword) {
      throw new Error("Incorrect value lock password.");
    }

    setHideValues(false);
    setValueLockNotice(null);
  };

  const handleSaveValueLockPassword = async (
    password: string,
    currentPassword?: string,
  ) => {
    await saveValueLockPassword(password, currentPassword);
    setHideValues(true);
    setValueLockNotice("Value lock password saved. Use Show Values to unlock.");
  };

  const handleClearValueLockPassword = async (currentPassword?: string) => {
    await clearValueLock(currentPassword);
    setHideValues(true);
    setShowValueUnlockModal(false);
    setValueLockNotice(
      "Value lock password removed. Set a new password before values can be revealed again.",
    );
  };

  const fireProgressSnapshot = getPreviousSnapshot();
  const netWorthSnapshots = getNetWorthSnapshots();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-[var(--qb-green-muted)]">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">Loading your data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--qb-green-muted)]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-gradient-to-br from-orange-500 via-amber-500 to-red-500 p-2 shadow-sm">
              <Flame size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                Time to FIRE
              </h1>
              <p className="text-xs text-gray-500">
                Track your financial journey
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <button
              onClick={handleShowValuesRequest}
              aria-pressed={hideValues}
              disabled={isValueLockStatusLoading}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-all ${
                hideValues
                  ? "border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-300 hover:bg-orange-100"
                  : "border-gray-300 text-gray-600 hover:border-[#9FD792] hover:bg-[#EEF9EA] hover:text-[#1E7A18]"
              }`}
            >
              {hideValues ? <Eye size={15} /> : <EyeOff size={15} />}
              {isValueLockStatusLoading
                ? "Checking..."
                : hideValues
                  ? hasValueLockPassword
                    ? "Show Values"
                    : "Set Value Lock"
                  : "Hide Values"}
            </button>

            <button
              onClick={() => setShowValueLockSettings(true)}
              disabled={isValueLockStatusLoading}
              className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-all hover:border-[#9FD792] hover:bg-[#EEF9EA] hover:text-[#1E7A18] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Lock size={15} />
              Value Lock
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="min-w-0 space-y-6">
          {error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          ) : null}

          {valueLockError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {valueLockError}
            </div>
          ) : null}

          {valueLockNotice ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {valueLockNotice}
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">
              Loading saved data...
            </div>
          ) : (
            <>
              <FireSummaryCards
                hideValues={hideValues}
                fireSettings={fireSettings}
                snapshots={netWorthSnapshots}
                latestSnapshot={fireProgressSnapshot}
                onUpdateFireSettings={updateFireSettings}
              />

              <ProgressSummary
                hideValues={hideValues}
                snapshots={netWorthSnapshots}
              />

              <section>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-gray-700">
                      Monthly Breakdown —
                    </h2>
                    <div className="flex items-center gap-1 rounded-xl bg-gray-100 px-1 py-1">
                      <button
                        onClick={() => setTableYear((year) => year - 1)}
                        className="rounded-lg p-1.5 text-gray-500 transition-all hover:bg-white hover:text-[#1E7A18] hover:shadow-sm"
                        aria-label="Previous year"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="min-w-16 px-3 text-center text-sm font-semibold text-gray-700">
                        {tableYear}
                      </span>
                      <button
                        onClick={() => setTableYear((year) => year + 1)}
                        className="rounded-lg p-1.5 text-gray-500 transition-all hover:bg-white hover:text-[#1E7A18] hover:shadow-sm"
                        aria-label="Next year"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        if (hideValues) {
                          handleShowValuesRequest();
                          return;
                        }

                        handleExportCsv();
                      }}
                      disabled={isValueLockStatusLoading}
                      className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-all hover:border-[#9FD792] hover:bg-gray-50 hover:text-[#1E7A18] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Download size={15} />
                      {hideValues ? "Unlock to export" : "Export CSV"}
                    </button>
                    <button
                      onClick={() => importInputRef.current?.click()}
                      disabled={isImportingCsv}
                      className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-all hover:border-[#9FD792] hover:bg-gray-50 hover:text-[#1E7A18] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Upload size={15} />
                      {isImportingCsv ? "Importing..." : "Import CSV"}
                    </button>
                    <button
                      onClick={() => setShowConfig(true)}
                      className="flex items-center gap-2 rounded-xl border border-green-200 px-4 py-2 text-sm text-green-700 transition-all hover:border-green-300 hover:bg-green-50"
                    >
                      <Settings size={15} />
                      Categories
                    </button>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(event) => void handleImportCsv(event)}
                    />
                  </div>
                </div>
                {csvNotice ? (
                  <div className="mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
                    {csvNotice}
                  </div>
                ) : null}
                <NetWorthTable
                  hideValues={hideValues}
                  year={tableYear}
                  categories={categories}
                  getValue={getValue}
                  setValue={setValue}
                  getMonthTotal={getMonthTotal}
                  getCategoryMonthTotal={getCategoryMonthTotal}
                />
              </section>
            </>
          )}
        </div>
      </main>

      {/* Category Config Modal */}
      {showConfig && (
        <CategoryConfig
          categories={categories}
          onUpdate={updateCategories}
          onClose={() => setShowConfig(false)}
        />
      )}

      {showValueLockSettings ? (
        <ValueLockSettingsModal
          hasValueLockPassword={hasValueLockPassword}
          onSaveValueLockPassword={handleSaveValueLockPassword}
          onClearValueLockPassword={handleClearValueLockPassword}
          onClose={() => setShowValueLockSettings(false)}
        />
      ) : null}

      {showValueUnlockModal ? (
        <ValueUnlockModal
          onUnlock={handleUnlockValues}
          onClose={() => setShowValueUnlockModal(false)}
        />
      ) : null}
    </div>
  );
}

export default App;
