import { Sparkles } from "lucide-react";
import { BackgroundAnimation } from "@/components/BackgroundAnimation";

export function BrandSection() {
  return (
    <section className="relative hidden min-h-screen overflow-hidden border-r border-white/8 lg:flex lg:w-[54%] lg:flex-col">
      <BackgroundAnimation />
      <div className="relative z-10 flex h-full flex-col justify-between px-10 py-10 xl:px-14 xl:py-12">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-white/6 backdrop-blur-xl">
            <Sparkles className="h-5 w-5 text-indigo-300" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[0.22em] text-white/82 uppercase">
              Cognitive Mirror
            </p>
            <p className="text-sm text-white/48">
              Enterprise Capability Intelligence Platform
            </p>
          </div>
        </div>

        <div className="max-w-xl space-y-7">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs tracking-[0.28em] text-white/58 uppercase backdrop-blur-xl">
            Capability Intelligence
          </div>
          <div className="space-y-5">
            <h1 className="max-w-lg text-5xl font-semibold leading-[1.02] tracking-[-0.05em] text-white xl:text-6xl">
              Cognitive Mirror
            </h1>
            <p className="max-w-md text-xl leading-8 tracking-[-0.02em] text-zinc-300">
              Measure Capability. Validate Growth.
            </p>
            <p className="max-w-xl text-base leading-8 text-zinc-400">
              A premium operating layer for capability discovery, learning evidence,
              AI-assisted review, and manager validation across the enterprise.
            </p>
          </div>
        </div>

        <div className="grid max-w-2xl grid-cols-3 gap-4">
          {[
            "Capability pathways with clear evidence loops",
            "Structured AI review designed for human trust",
            "Validation signals for managers and leaders",
          ].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-zinc-300 backdrop-blur-xl"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
