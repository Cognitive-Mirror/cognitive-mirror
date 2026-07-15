import { BrandSection, LoginCard } from "@/components/LoginExperience";
import { ThemeToggle } from "@/components/ThemeControls";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden t-bg t-fg">
      {/* theme toggle — top right */}
      <div className="fixed right-5 top-5 z-30">
        <ThemeToggle />
      </div>

      {/* subtle top glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.10),transparent_30%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1680px] flex-col lg:flex-row">
        <BrandSection />

        {/* Right — login form */}
        <section className="relative flex min-h-screen flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:w-[46%] lg:px-10 xl:px-14">
          {/* mobile top glow */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_60%)] lg:hidden" />

          <div className="w-full max-w-xl">
            {/* mobile brand text */}
            <div className="mb-8 space-y-3 lg:hidden">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] t-muted">
                Cognitive Mirror
              </p>
              <h1 className="text-4xl font-semibold tracking-[-0.05em] t-fg">
                Measure Capability. Validate Growth.
              </h1>
              <p className="max-w-lg text-sm leading-7 t-muted">
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
