import BrandMark from "./BrandMark";

/** A quiet loading state while the real session or workspace is opening. */
export default function AuthLoadingScreen({
  label = "Loading your session…",
}: {
  label?: string;
}) {
  return (
    <main className="vx-auth-loading fixed inset-0 z-50 flex flex-col bg-[#F4F7FC] text-slate-900 antialiased" aria-busy="true">
      <header className="flex items-center gap-2.5 px-6 py-5 sm:px-8">
        <BrandMark size={28} />
        <span className="text-sm font-semibold tracking-tight">Kreovar</span>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 pb-20">
        <div role="status" aria-live="polite" aria-atomic="true" className="flex w-full max-w-sm flex-col items-center text-center">
          <div className="vx-auth-loading-mark mb-7 flex h-20 w-20 items-center justify-center rounded-3xl border border-white bg-white/80">
            <BrandMark size={48} />
          </div>
          <p role="status" className="text-lg font-semibold tracking-tight">{label}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">Just a moment.</p>
          <div aria-hidden="true" className="mt-6 h-1 w-32 overflow-hidden rounded-full bg-slate-200">
            <div className="vx-loading-track h-full w-1/2 rounded-full bg-blue-600" />
          </div>
        </div>
      </div>
    </main>
  );
}
