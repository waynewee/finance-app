import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { getSupabaseConfigError } from "./lib/supabase";

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10 text-slate-900">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Deployment Setup Required
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Configure environment variables
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">{message}</p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-medium text-slate-900">
            Required variables
          </p>
          <pre className="mt-3 overflow-x-auto text-sm leading-7 text-slate-700">
            {`VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_FINNHUB_API_KEY=your-finnhub-api-key`}
          </pre>
        </div>

        <p className="mt-5 text-sm leading-6 text-slate-600">
          After setting these on your hosting provider, redeploy the app and add
          the deployed URL to the Supabase Auth redirect allow list.
        </p>
      </div>
    </div>
  );
}

const configError = getSupabaseConfigError();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {configError ? <ConfigErrorScreen message={configError} /> : <App />}
  </StrictMode>,
);
