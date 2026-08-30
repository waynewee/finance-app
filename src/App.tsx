import { useRef, useState } from "react";
import {
  Download,
  Lock,
  Settings,
  ChevronLeft,
  ChevronRight,
  Upload,
  Flame,
  TrendingUp,
  Eye,
  EyeOff,
} from "lucide-react";
import { useValueLock } from "./hooks/useValueLock";
import { useNetWorthData } from "./hooks/useNetWorthData";
import NetWorthTable from "./components/NetWorthTable";
import NetWorthChart from "./components/NetWorthChart";
import CategoryConfig from "./components/CategoryConfig";
import ProgressSummary from "./components/ProgressSummary";
import FireTracker from "./components/FireTracker";
import RetirementConfigModal from "./components/RetirementConfigModal";
import ValueLockSettingsModal from "./components/ValueLockSettingsModal";
import ValueUnlockModal from "./components/ValueUnlockModal";
import {
  getStoredFireSnapshotPreference,
  getStoredSummarySnapshotPreference,
  setStoredFireSnapshotPreference,
  setStoredSummarySnapshotPreference,
  type FireSnapshotPreference,
} from "./lib/firePreferences";
import { buildYearCsv, parseYearCsv } from "./lib/netWorthCsv";

type AppPage = "net-worth" | "fire-tracker";
type NetWorthDisplay = "summary" | "chart";

function App() {
  const currentYear = new Date().getFullYear();
  const [tableYear, setTableYear] = useState(currentYear);
  const [showConfig, setShowConfig] = useState(false);
  const [showRetirementConfig, setShowRetirementConfig] = useState(false);
  const [showValueLockSettings, setShowValueLockSettings] = useState(false);
  const [showValueUnlockModal, setShowValueUnlockModal] = useState(false);
  const [hideValues, setHideValues] = useState(true);
  const [activePage, setActivePage] = useState<AppPage>("net-worth");
  const [activeDisplay, setActiveDisplay] =
    useState<NetWorthDisplay>("summary");
  const [summarySnapshotPreference, setSummarySnapshotPreference] =
    useState<FireSnapshotPreference>(
      getStoredSummarySnapshotPreference(undefined),
    );
  const [fireSnapshotPreference, setFireSnapshotPreference] =
    useState<FireSnapshotPreference>(
      getStoredFireSnapshotPreference(undefined),
    );
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
    monthlyData,
    isLoading,
    error,
    fireSettings,
    getValue,
    setValue,
    getMonthTotal,
    getCategoryMonthTotal,
    getLatestSnapshot,
    getNetWorthSnapshots,
    getPreviousSnapshot,
    updateCategories,
    updateFireSettings,
    replaceYearData,
  } = useNetWorthData();

  const updateSummarySnapshotPreference = (
    preference: FireSnapshotPreference,
  ) => {
    setSummarySnapshotPreference(preference);
    setStoredSummarySnapshotPreference(undefined, preference);
  };

  const updateFireSnapshotPreference = (preference: FireSnapshotPreference) => {
    setFireSnapshotPreference(preference);
    setStoredFireSnapshotPreference(undefined, preference);
  };

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

  const handleSaveValueLockPassword = async (password: string) => {
    await saveValueLockPassword(password);
    setHideValues(true);
    setValueLockNotice("Value lock password saved. Use Show Values to unlock.");
  };

  const handleClearValueLockPassword = async () => {
    await clearValueLock();
    setHideValues(true);
    setShowValueUnlockModal(false);
    setValueLockNotice(
      "Value lock password removed. Set a new password before values can be revealed again.",
    );
  };

  const latestSnapshot = getLatestSnapshot();
  const previousSnapshot = getPreviousSnapshot();
  const netWorthSnapshots = getNetWorthSnapshots();
  const summaryYear = latestSnapshot?.year ?? currentYear;
  const fireSnapshot =
    fireSnapshotPreference === "previous" && previousSnapshot
      ? previousSnapshot
      : latestSnapshot;
  const displayOptions: Array<{
    id: NetWorthDisplay;
    label: string;
    description: string;
  }> = [
    {
      id: "summary",
      label: "Summary",
      description: "Key month-to-month and cross-year trend changes",
    },
    {
      id: "chart",
      label: "Chart",
      description: "Visualize category balances across the year",
    },
  ];
  const selectedDisplay = displayOptions.find(
    (display) => display.id === activeDisplay,
  );

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
              className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-all hover:border-[#9FD792] hover:bg-[#EEF9EA] hover:text-[#1E7A18]"
            >
              <Lock size={15} />
              Value Lock
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
          <aside className="lg:sticky lg:top-6 self-start">
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                  Workspace
                </p>
                <h2 className="mt-2 text-lg font-semibold text-gray-900">
                  Views
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Keep your planner mode pinned on the left.
                </p>
              </div>

              <div className="mt-5 space-y-5">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                    Mode
                  </p>
                  <div className="space-y-2">
                    <button
                      onClick={() => setActivePage("net-worth")}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                        activePage === "net-worth"
                          ? "border-[#9FD792] bg-[#EEF9EA] text-[#1E7A18] shadow-sm"
                          : "border-gray-200 text-gray-600 hover:border-[#9FD792] hover:bg-gray-50 hover:text-[#1E7A18]"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <TrendingUp size={16} />
                        Net Worth
                      </span>
                      {activePage === "net-worth" ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[#1E7A18]">
                          Active
                        </span>
                      ) : null}
                    </button>

                    <button
                      onClick={() => {
                        setShowConfig(false);
                        setActivePage("fire-tracker");
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                        activePage === "fire-tracker"
                          ? "border-[#F4B183] bg-orange-50 text-orange-700 shadow-sm"
                          : "border-gray-200 text-gray-600 hover:border-[#F4B183] hover:bg-orange-50 hover:text-orange-700"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Flame size={16} />
                        FIRE Tracker
                      </span>
                      {activePage === "fire-tracker" ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-orange-700">
                          Active
                        </span>
                      ) : null}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </aside>

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
                {activePage === "net-worth" ? (
                  <>
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h2 className="text-base font-semibold text-gray-900">
                            Net Worth Views
                          </h2>
                          <p className="mt-1 text-sm text-gray-500">
                            {selectedDisplay?.description}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-100 p-1">
                          {displayOptions.map((display) => (
                            <button
                              key={display.id}
                              onClick={() => setActiveDisplay(display.id)}
                              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                                activeDisplay === display.id
                                  ? "bg-white text-[#1E7A18] shadow-sm"
                                  : "text-gray-500 hover:text-[#1E7A18]"
                              }`}
                            >
                              {display.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>

                    {activeDisplay === "summary" ? (
                      <ProgressSummary
                        hideValues={hideValues}
                        year={summaryYear}
                        snapshots={netWorthSnapshots}
                        comparisonMode={summarySnapshotPreference}
                        onComparisonModeChange={updateSummarySnapshotPreference}
                      />
                    ) : null}

                    {activeDisplay === "chart" ? (
                      <NetWorthChart
                        hideValues={hideValues}
                        categories={categories}
                        monthlyData={monthlyData}
                        getCategoryMonthTotal={getCategoryMonthTotal}
                        getMonthTotal={getMonthTotal}
                      />
                    ) : null}
                  </>
                ) : (
                  <FireTracker
                    hideValues={hideValues}
                    fireSettings={fireSettings}
                    snapshots={netWorthSnapshots}
                    selectedSnapshot={fireSnapshot}
                    previousSnapshot={previousSnapshot}
                    snapshotPreference={fireSnapshotPreference}
                    onSnapshotPreferenceChange={updateFireSnapshotPreference}
                    onUpdateFireSettings={updateFireSettings}
                    onOpenRetirementConfig={() => setShowRetirementConfig(true)}
                  />
                )}

                {activePage === "net-worth" ? (
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
                ) : null}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Category Config Modal */}
      {showConfig && activePage === "net-worth" && (
        <CategoryConfig
          categories={categories}
          onUpdate={updateCategories}
          onClose={() => setShowConfig(false)}
        />
      )}

      {showRetirementConfig && activePage === "fire-tracker" && (
        <RetirementConfigModal
          settings={fireSettings}
          latestSnapshot={latestSnapshot}
          onUpdate={updateFireSettings}
          onClose={() => setShowRetirementConfig(false)}
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
