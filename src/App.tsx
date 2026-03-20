import { useEffect, useRef, useState } from "react";
import {
  Calculator,
  Download,
  LogOut,
  Mail,
  Settings,
  ChevronLeft,
  ChevronRight,
  Upload,
  Users,
  Flame,
  TrendingUp,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAccountAccess } from "./hooks/useAccountAccess";
import { useSupabaseAuth } from "./hooks/useSupabaseAuth";
import { useNetWorthData } from "./hooks/useNetWorthData";
import NetWorthTable from "./components/NetWorthTable";
import NetWorthChart from "./components/NetWorthChart";
import CategoryConfig from "./components/CategoryConfig";
import ProgressSummary from "./components/ProgressSummary";
import InvestmentPlannerPage from "./components/InvestmentPlannerPage";
import FireTracker from "./components/FireTracker";
import RetirementConfigModal from "./components/RetirementConfigModal";
import ShareAccountModal from "./components/ShareAccountModal";
import {
  getStoredFireSavingsAveragePreference,
  getStoredFireSnapshotPreference,
  getStoredSummarySnapshotPreference,
  setStoredFireSavingsAveragePreference,
  setStoredFireSnapshotPreference,
  setStoredSummarySnapshotPreference,
  type FireSavingsAveragePreference,
  type FireSnapshotPreference,
} from "./lib/firePreferences";
import { buildYearCsv, parseYearCsv } from "./lib/netWorthCsv";

type AppPage = "net-worth" | "investment-planner";
type NetWorthDisplay = "summary" | "fire" | "chart";

function App() {
  const currentYear = new Date().getFullYear();
  const [tableYear, setTableYear] = useState(currentYear);
  const [showConfig, setShowConfig] = useState(false);
  const [showRetirementConfig, setShowRetirementConfig] = useState(false);
  const [showShareAccount, setShowShareAccount] = useState(false);
  const [hideValues, setHideValues] = useState(false);
  const [activePage, setActivePage] = useState<AppPage>("net-worth");
  const [activeDisplay, setActiveDisplay] =
    useState<NetWorthDisplay>("summary");
  const [summarySnapshotPreference, setSummarySnapshotPreference] =
    useState<FireSnapshotPreference>("current");
  const [fireSnapshotPreference, setFireSnapshotPreference] =
    useState<FireSnapshotPreference>("current");
  const [fireSavingsAveragePreference, setFireSavingsAveragePreference] =
    useState<FireSavingsAveragePreference>(3);
  const [email, setEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isSendingSignInEmail, setIsSendingSignInEmail] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [csvNotice, setCsvNotice] = useState<string | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const {
    user,
    isLoading: isAuthLoading,
    error: authError,
    sendSignInEmail,
    verifyEmailOtp,
    signOut,
  } = useSupabaseAuth();

  const {
    accounts,
    activeAccountId,
    activeAccount,
    isOwnerOfActiveAccount,
    sharing,
    isLoading: isAccountLoading,
    error: accountError,
    setActiveAccountId,
    renameActiveAccount,
    inviteCollaborator,
    removeCollaborator,
    cancelInvitation,
  } = useAccountAccess(user);

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
  } = useNetWorthData(activeAccountId);

  useEffect(() => {
    setSummarySnapshotPreference(getStoredSummarySnapshotPreference(user?.id));
    setFireSnapshotPreference(getStoredFireSnapshotPreference(user?.id));
    setFireSavingsAveragePreference(
      getStoredFireSavingsAveragePreference(user?.id),
    );
  }, [user?.id]);

  const updateSummarySnapshotPreference = (
    preference: FireSnapshotPreference,
  ) => {
    setSummarySnapshotPreference(preference);
    setStoredSummarySnapshotPreference(user?.id, preference);
  };

  const updateFireSnapshotPreference = (preference: FireSnapshotPreference) => {
    setFireSnapshotPreference(preference);
    setStoredFireSnapshotPreference(user?.id, preference);
  };

  const updateFireSavingsAveragePreference = (
    preference: FireSavingsAveragePreference,
  ) => {
    setFireSavingsAveragePreference(preference);
    setStoredFireSavingsAveragePreference(user?.id, preference);
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

  const handleSendSignInEmail = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthNotice("Enter your email address to receive a sign-in code.");
      return;
    }

    setIsSendingSignInEmail(true);

    try {
      await sendSignInEmail(trimmedEmail);
      setAuthNotice(
        `Sign-in email sent to ${trimmedEmail}. Enter the code from that email to sign in.`,
      );
    } catch {
      setAuthNotice(null);
    } finally {
      setIsSendingSignInEmail(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    const trimmedEmail = email.trim();
    const trimmedOtp = emailOtp.trim();

    if (!trimmedEmail) {
      setAuthNotice("Enter your email address before verifying the code.");
      return;
    }

    if (!trimmedOtp) {
      setAuthNotice("Enter the sign-in code from your email.");
      return;
    }

    setIsVerifyingOtp(true);

    try {
      await verifyEmailOtp(trimmedEmail, trimmedOtp);
      setAuthNotice("Code accepted. Loading your account...");
      setEmailOtp("");
    } catch {
      setAuthNotice(null);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setShowConfig(false);
    setShowRetirementConfig(false);
    setShowShareAccount(false);
    setActivePage("net-worth");
    setAuthNotice(null);
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
      id: "fire",
      label: "FIRE",
      description: "Financial independence progress and target tracking",
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

  if (isAuthLoading || (user && isAccountLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-[var(--qb-green-muted)]">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">
            {isAuthLoading
              ? "Checking your session..."
              : "Loading your shared account access..."}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-[var(--qb-green-muted)]">
        <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-red-500 p-3 shadow-sm">
              <Flame size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Time to FIRE</h1>
              <p className="text-sm text-gray-500">
                Sign in with your email code
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleSendSignInEmail();
                  }
                }}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
              />
            </label>

            <button
              onClick={() => void handleSendSignInEmail()}
              disabled={isSendingSignInEmail}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2CA01C] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#248814] disabled:cursor-not-allowed disabled:bg-[#9FD792]"
            >
              <Mail size={16} />
              {isSendingSignInEmail ? "Sending OTP..." : "Email OTP"}
            </button>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-sm font-medium text-gray-800">
                Enter your OTP
              </p>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={emailOtp}
                onChange={(event) => setEmailOtp(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleVerifyEmailOtp();
                  }
                }}
                placeholder="6-digit OTP"
                className="mt-3 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
              />

              <button
                onClick={() => void handleVerifyEmailOtp()}
                disabled={isVerifyingOtp}
                className="mt-3 flex w-full items-center justify-center rounded-xl border border-[#2CA01C] px-4 py-3 text-sm font-medium text-[#1E7A18] transition-colors hover:bg-[#EEF9EA] disabled:cursor-not-allowed disabled:border-[#9FD792] disabled:text-[#7FBF76]"
              >
                {isVerifyingOtp ? "Checking OTP..." : "Confirm"}
              </button>
            </div>
          </div>

          {authNotice ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {authNotice}
            </div>
          ) : null}

          {authError ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {authError}
            </div>
          ) : null}
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
                {activeAccount
                  ? `${activeAccount.accountName}${
                      activeAccount.role === "collaborator"
                        ? " · shared with you"
                        : ""
                    }`
                  : "Track your financial journey"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <button
              onClick={() => setHideValues((previous) => !previous)}
              aria-pressed={hideValues}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-all ${
                hideValues
                  ? "border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-300 hover:bg-orange-100"
                  : "border-gray-300 text-gray-600 hover:border-[#9FD792] hover:bg-[#EEF9EA] hover:text-[#1E7A18]"
              }`}
            >
              {hideValues ? <Eye size={15} /> : <EyeOff size={15} />}
              {hideValues ? "Show Values" : "Hide Values"}
            </button>

            {activePage === "net-worth" ? (
              <button
                onClick={() => setShowShareAccount(true)}
                className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-all hover:border-[#9FD792] hover:bg-[#EEF9EA] hover:text-[#1E7A18]"
              >
                <Users size={15} />
                Sharing
              </button>
            ) : null}

            <button
              onClick={() => void handleSignOut()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all"
            >
              <LogOut size={15} />
              Sign Out
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
                  Account & Views
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Keep your active account and planner mode pinned on the left.
                </p>
              </div>

              <div className="mt-5 space-y-5">
                {accounts.length > 0 ? (
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">
                      Account
                    </span>
                    <select
                      value={activeAccountId ?? ""}
                      onChange={(event) =>
                        setActiveAccountId(event.target.value)
                      }
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                    >
                      {accounts.map((account) => (
                        <option key={account.userId} value={account.userId}>
                          {account.accountName}
                          {account.role === "collaborator" ? " (shared)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
                    No accounts available yet.
                  </div>
                )}

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
                        FIRE Net Worth
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
                        setActivePage("investment-planner");
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                        activePage === "investment-planner"
                          ? "border-[#9FD792] bg-[#EEF9EA] text-[#1E7A18] shadow-sm"
                          : "border-gray-200 text-gray-600 hover:border-[#9FD792] hover:bg-gray-50 hover:text-[#1E7A18]"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Calculator size={16} />
                        Planner
                      </span>
                      {activePage === "investment-planner" ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[#1E7A18]">
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

            {accountError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {accountError}
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
                                  ? display.id === "fire"
                                    ? "bg-white text-orange-700 shadow-sm"
                                    : "bg-white text-[#1E7A18] shadow-sm"
                                  : display.id === "fire"
                                    ? "text-gray-500 hover:text-orange-700"
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

                    {activeDisplay === "fire" ? (
                      <FireTracker
                        hideValues={hideValues}
                        fireSettings={fireSettings}
                        snapshots={netWorthSnapshots}
                        selectedSnapshot={fireSnapshot}
                        previousSnapshot={previousSnapshot}
                        snapshotPreference={fireSnapshotPreference}
                        savingsAveragePreference={fireSavingsAveragePreference}
                        onSnapshotPreferenceChange={
                          updateFireSnapshotPreference
                        }
                        onSavingsAveragePreferenceChange={
                          updateFireSavingsAveragePreference
                        }
                        onUpdateFireSettings={updateFireSettings}
                        onOpenRetirementConfig={() =>
                          setShowRetirementConfig(true)
                        }
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
                            onClick={handleExportCsv}
                            className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-all hover:border-[#9FD792] hover:bg-gray-50 hover:text-[#1E7A18]"
                          >
                            <Download size={15} />
                            Export CSV
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
                ) : (
                  <InvestmentPlannerPage
                    accountUserId={activeAccountId ?? user.id}
                    hideValues={hideValues}
                  />
                )}
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

      {showRetirementConfig && activePage === "net-worth" && (
        <RetirementConfigModal
          settings={fireSettings}
          latestSnapshot={latestSnapshot}
          onUpdate={updateFireSettings}
          onClose={() => setShowRetirementConfig(false)}
        />
      )}

      {showShareAccount && activeAccount ? (
        <ShareAccountModal
          accountName={activeAccount.accountName}
          isOwner={isOwnerOfActiveAccount}
          collaborators={sharing.collaborators}
          invitations={sharing.invitations}
          isLoading={sharing.isLoading}
          onRenameAccount={renameActiveAccount}
          onInvite={inviteCollaborator}
          onRemoveCollaborator={removeCollaborator}
          onCancelInvitation={cancelInvitation}
          onClose={() => setShowShareAccount(false)}
        />
      ) : null}
    </div>
  );
}

export default App;
