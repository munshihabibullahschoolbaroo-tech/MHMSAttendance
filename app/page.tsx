import { BrowserTimeZoneSync } from "@/components/client/browser-timezone-sync";
import { DashboardUserProvider } from "@/components/client/dashboard-user-context";
import { LandingTopBar } from "@/components/client/landing-top-bar";
import { LandingHeroButtons } from "@/components/client/landing-hero-buttons";
import { LocalTimezoneClock } from "@/components/client/local-timezone-clock";
import { MtesBrandHeaderLink } from "@/components/client/mtes-brand-lockup";
import { MhmsMark } from "@/components/mhms-mark";

export default function HomePage() {
  return (
    <DashboardUserProvider>
      <BrowserTimeZoneSync />
      <div className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 hero-mesh opacity-90 dark:opacity-100" />
        
        {/* Floating Transparent Header */}
        <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between gap-3 px-3 py-3 md:px-6 md:py-5 bg-transparent border-0 shadow-none pointer-events-none">
          <div className="pointer-events-auto">
            <MtesBrandHeaderLink showLogo={true} className="max-w-[min(100%,18rem)] md:max-w-lg" />
          </div>
          <div className="pointer-events-auto">
            <LandingTopBar />
          </div>
        </header>

        {/* Scrollable Main Area extending full height with smooth top & bottom dissolve mask */}
        <main className="relative z-10 flex-1 min-h-0 w-full overflow-y-auto overscroll-y-contain flex flex-col items-center px-3 pt-16 pb-8 md:px-6 md:pt-20 md:pb-12 text-center no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent_0%,black_72px,black_calc(100%-48px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_72px,black_calc(100%-48px),transparent_100%)]">
          <div className="my-auto flex w-full max-w-4xl flex-col items-center py-4 pb-12 md:py-8">
            <div className="mb-6 flex w-full max-w-lg flex-col items-center md:mb-10">
              <MhmsMark className="h-20 w-20 md:h-28 md:w-28" />
              <div className="mt-3.5 w-full max-w-md space-y-1.5 px-1">
                <p className="text-center text-[10px] font-semibold uppercase leading-snug tracking-[0.14em] text-zinc-600 dark:text-zinc-400 md:text-xs md:tracking-[0.2em]">
                  Munshi Habibullah Mission School
                </p>
                <p className="text-center text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-500 md:text-[11px] md:tracking-[0.28em]">
                  Bemathang, Kargil
                </p>
              </div>
            </div>

            <p className="mb-3 text-[10px] uppercase tracking-[0.28em] text-violet-500 dark:text-cyan-400 md:mb-4 md:text-xs md:tracking-[0.35em]">
              Teacher attendance
            </p>
            <h1 className="max-w-3xl text-balance text-xl font-semibold leading-snug tracking-tight text-zinc-900 sm:text-2xl sm:leading-snug md:text-4xl md:leading-tight lg:text-5xl dark:text-zinc-50">
              <span className="md:hidden">
              Higher, Lower, and Rewa na KASCO.
              </span>
              <span className="hidden md:block">
              Attendance for the teachers of MHMS
              </span>
            </h1>
            <div className="mt-6 sm:mt-10 w-full flex items-center justify-center">
              <LandingHeroButtons />
            </div>

            <LocalTimezoneClock className="mt-8 sm:mt-12 max-w-lg" />
          </div>
        </main>
      </div>
    </DashboardUserProvider>
  );
}
