import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-zinc-50 dark:bg-[#050505]">
      <div className="pointer-events-none absolute inset-0 hero-mesh opacity-60" />
      <header className="relative z-10 flex items-center px-4 py-4 md:px-8 md:py-6">
        <Link
          href="/"
          aria-label="Go back"
          className="group relative flex size-10 md:size-11 items-center justify-center rounded-full bg-white/10 dark:bg-white/[0.08] backdrop-blur-xl border border-white/20 dark:border-white/15 text-zinc-800 dark:text-zinc-100 shadow-[0_8px_32px_0_rgba(0,0,0,0.25)] transition-all duration-300 hover:bg-white/20 dark:hover:bg-white/15 hover:scale-105 active:scale-95"
        >
          <ChevronLeft className="size-5 md:size-5.5 stroke-[2.5] transition-transform group-hover:-translate-x-0.5" />
        </Link>
      </header>
      <div className="relative z-10 flex flex-1 items-center justify-center p-3 md:p-6">
        {children}
      </div>
    </div>
  );
}
