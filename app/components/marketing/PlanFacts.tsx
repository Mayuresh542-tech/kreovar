import Link from "next/link";
import { getAllPlans } from "../../config/plans";

export default function PlanFacts() {
  return (
    <section aria-labelledby="plan-facts" className="vx-frosted-surface mt-16 rounded-3xl p-7 sm:p-8">
      <h2 id="plan-facts" className="text-2xl font-bold text-[#142440]">Free and Pro at a glance</h2>
      <div className="mt-6 grid gap-7 sm:grid-cols-2">
        {getAllPlans().map((plan) => (
          <article key={plan.id} className="rounded-2xl border border-slate-200/70 bg-white/75 p-5">
            <h3 className="text-lg font-semibold text-[#142440]">
              {plan.name} · {plan.displayPrice}
              {plan.id === "free" ? "" : "/month"}
            </h3>
            {plan.id !== "free" && (
              <p className="mt-1 text-sm text-[#52647e]">
                Or {plan.yearlyDisplayPrice}/year. Allowances reset monthly.
              </p>
            )}
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[#52647e]">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <Link href="/pricing" className="mt-6 inline-block font-semibold text-[#1D4FB1] underline">
        See pricing and full plan details
      </Link>
    </section>
  );
}
