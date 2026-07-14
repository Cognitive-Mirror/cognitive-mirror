import { BrandSection } from "@/components/BrandSection";
import { LoginCard } from "@/components/LoginCard";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#09090B] text-[#FAFAFA]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.14),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_25%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1680px] flex-col lg:flex-row">
        <BrandSection />

        <section className="relative flex min-h-screen flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:w-[46%] lg:px-10 xl:px-14">
          <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.15),transparent_58%)] lg:hidden" />
          <div className="w-full max-w-xl">
            <div className="mb-8 space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-400 lg:hidden">
                Cognitive Mirror
              </p>
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-zinc-50 lg:hidden">
                Measure Capability. Validate Growth.
              </h1>
              <p className="max-w-lg text-sm leading-7 text-zinc-400 lg:hidden">
                AI-assisted capability intelligence designed for evidence, validation,
                and enterprise trust.
              </p>
            </div>
            <LoginCard />
          </div>
        </section>
      </div>
    </main>
  );
}
