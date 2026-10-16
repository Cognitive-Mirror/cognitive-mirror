import { BrandSection, LoginCard } from "@/components/LoginExperience";
import { ThemeToggle } from "@/components/ThemeControls";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen">
      <BrandSection />

      <section className="relative flex min-h-screen flex-1 items-center justify-center px-5 py-16 sm:px-10">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[26rem]">
          <LoginCard />
        </div>
      </section>
    </main>
  );
}
