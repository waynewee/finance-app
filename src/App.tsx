import { useEffect, useState } from "react";
import {
  Calculator,
  LogOut,
  Mail,
  Settings,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAccountAccess } from "./hooks/useAccountAccess";
import { useSupabaseAuth } from "./hooks/useSupabaseAuth";
import { useNetWorthData } from "./hooks/useNetWorthData";
import NetWorthTable from "./components/NetWorthTable";
import NetWorthChart from "./components/NetWorthChart";
import CategoryConfig from "./components/CategoryConfig";
import ProgressSummary from "./components/ProgressSummary";
import InvestmentPlannerPage from "./components/InvestmentPlannerPage";
import FireConfigModal from "./components/FireConfigModal";
import FireTracker from "./components/FireTracker";
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

type AppPage = "net-worth" | "investment-planner";
type NetWorthDisplay = "summary" | "fire" | "chart";

function App() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showConfig, setShowConfig] = useState(false);
  const [showFireConfig, setShowFireConfig] = useState(false);
  const [showShareAccount, setShowShareAccount] = useState(false);
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
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isSendingLink, setIsSendingLink] = useState(false);

  const {
    user,
    isLoading: isAuthLoading,
    error: authError,
    sendMagicLink,
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

  const handleSendMagicLink = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthNotice("Enter your email address to receive a sign-in link.");
      return;
    }

    setIsSendingLink(true);

    try {
      await sendMagicLink(trimmedEmail);
      setAuthNotice(
        `Magic link sent to ${trimmedEmail}. Open the email on this device to sign in.`,
      );
    } catch {
      setAuthNotice(null);
    } finally {
      setIsSendingLink(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setShowConfig(false);
    setShowFireConfig(false);
    setShowShareAccount(false);
    setActivePage("net-worth");
    setAuthNotice(null);
  };

  const latestSnapshot = getLatestSnapshot();
  const previousSnapshot = getPreviousSnapshot();
  const netWorthSnapshots = getNetWorthSnapshots();
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
      description: "Key month-to-month and year-to-date changes",
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-indigo-600 p-3">
              <TrendingUp size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Net Worth Tracker
              </h1>
              <p className="text-sm text-gray-500">Sign in with a magic link</p>
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
                    void handleSendMagicLink();
                  }
                }}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </label>

            <button
              onClick={() => void handleSendMagicLink()}
              disabled={isSendingLink}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              <Mail size={16} />
              {isSendingLink ? "Sending link..." : "Email me a sign-in link"}
            </button>
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

          <p className="mt-6 text-xs leading-5 text-gray-500">
            In Supabase Auth, add your local and deployed app URLs to the
            redirect allow list.
          </p>

          <p className="mt-3 text-xs leading-5 text-gray-500">
            If someone shared a household account with you, sign in with the
            invited email and the app will attach that shared data set
            automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 rounded-xl p-2">
              <TrendingUp size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                Net Worth Tracker
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
            {activePage === "net-worth" ? (
              <>
                <button
                  onClick={() => setShowShareAccount(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-all"
                >
                  <Users size={15} />
                  Sharing
                </button>

                <div className="flex items-center gap-1 bg-gray-100 rounded-xl px-1 py-1">
                  <button
                    onClick={() => setSelectedYear((y) => y - 1)}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-indigo-600 hover:shadow-sm transition-all"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-semibold text-gray-700 px-3 min-w-16 text-center">
                    {selectedYear}
                  </span>
                  <button
                    onClick={() => setSelectedYear((y) => y + 1)}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-indigo-600 hover:shadow-sm transition-all"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <button
                  onClick={() => setShowConfig(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-all"
                >
                  <Settings size={15} />
                  Categories
                </button>

                <button
                  onClick={() => setShowFireConfig(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-all"
                >
                  <Calculator size={15} />
                  FIRE
                </button>
              </>
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
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
                          ? "border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm"
                          : "border-gray-200 text-gray-600 hover:border-indigo-200 hover:bg-gray-50 hover:text-indigo-600"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <TrendingUp size={16} />
                        Net Worth
                      </span>
                      {activePage === "net-worth" ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-indigo-700">
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
                          ? "border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm"
                          : "border-gray-200 text-gray-600 hover:border-indigo-200 hover:bg-gray-50 hover:text-indigo-600"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Calculator size={16} />
                        Planner
                      </span>
                      {activePage === "investment-planner" ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-indigo-700">
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
                                  ? "bg-white text-indigo-700 shadow-sm"
                                  : "text-gray-500 hover:text-indigo-600"
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
                        year={selectedYear}
                        getMonthTotal={getMonthTotal}
                        comparisonMode={summarySnapshotPreference}
                        onComparisonModeChange={updateSummarySnapshotPreference}
                      />
                    ) : null}

                    {activeDisplay === "fire" ? (
                      <FireTracker
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
                        onOpenConfig={() => setShowFireConfig(true)}
                      />
                    ) : null}

                    {activeDisplay === "chart" ? (
                      <NetWorthChart
                        year={selectedYear}
                        categories={categories}
                        getCategoryMonthTotal={getCategoryMonthTotal}
                        getMonthTotal={getMonthTotal}
                      />
                    ) : null}

                    <section>
                      <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-base font-semibold text-gray-700">
                          Monthly Breakdown — {selectedYear}
                        </h2>
                        <p className="text-xs text-gray-400">
                          Click any cell to edit
                        </p>
                      </div>
                      <NetWorthTable
                        year={selectedYear}
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

      {showFireConfig && activePage === "net-worth" && (
        <FireConfigModal
          settings={fireSettings}
          latestSnapshot={latestSnapshot}
          previousSnapshot={previousSnapshot}
          snapshotPreference={fireSnapshotPreference}
          savingsAveragePreference={fireSavingsAveragePreference}
          onSnapshotPreferenceChange={updateFireSnapshotPreference}
          onSavingsAveragePreferenceChange={updateFireSavingsAveragePreference}
          onUpdate={updateFireSettings}
          onClose={() => setShowFireConfig(false)}
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
