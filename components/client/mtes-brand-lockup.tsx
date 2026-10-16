"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_VENDOR } from "@/lib/constants";
import { MhmsMark } from "@/components/mhms-mark";

/** Light: MHMS in school brand brown (#7A3818); dark: vibrant school yellow (#FBBF24). */
const mtesWordClasses = "font-bold text-[#7A3818] dark:text-[#FBBF24]";

type Props = {
  variant?: "hero" | "sidebar" | "header" | "inline";
  className?: string;
  showLogo?: boolean;
  /** Show “by Constcode” under the product name (off for tight inline links). */
  showVendor?: boolean;
  /** Hide text (MHMSAttendance and address) on mobile, showing only the logo mark. */
  hideTextOnMobile?: boolean;
};

/**
 * MHMS (blue) + Attendance + Bemathang, Kargil.
 */
export function MtesBrandLockup({
  variant = "hero",
  className,
  showLogo = true,
  showVendor = true,
  hideTextOnMobile = false,
}: Props) {
  const isHero = variant === "hero";
  const isSidebar = variant === "sidebar";
  const isHeader = variant === "header";
  const isInline = variant === "inline";

  const titleClass = cn(
    "font-semibold tracking-tight",
    isHero && "text-2xl md:text-3xl",
    isSidebar && "text-base leading-tight",
    isHeader && "text-sm font-semibold leading-tight",
    isInline && "text-sm font-semibold"
  );

  const byClass = cn(
    "text-foreground",
    isHero && "mt-1 text-xs tracking-wide md:text-sm",
    isSidebar && "mt-0.5 text-[10px] tracking-wide",
    isHeader && "mt-0 text-[10px] tracking-wide",
    isInline && "mt-0 text-[10px] tracking-wide"
  );

  const wordmark = (
    <span className={titleClass}>
      <span className={mtesWordClasses}>MHMS</span>
      <span className="text-foreground">Attendance</span>
    </span>
  );

  /** Hero: centered stack. Nav (header/sidebar): clean left alignment next to mark. */
  const isLeftAligned = isHeader || isSidebar;
  const navStack = !isHero && !isLeftAligned;
  const byline = showVendor ? (
    <p className={cn(byClass, isLeftAligned ? "text-left" : navStack ? "text-right" : "text-center")}>{APP_VENDOR}</p>
  ) : null;

  const stackedTitle = (
    <div
      className={cn(
        "inline-flex flex-col",
        isLeftAligned ? "items-start" : navStack ? "items-end" : "items-center"
      )}
    >
      {wordmark}
      {byline}
    </div>
  );

  if (isInline) {
    if (!showVendor) {
      return <span className={className}>{wordmark}</span>;
    }
    return (
      <span className={cn("inline-flex flex-col items-end", className)}>
        {wordmark}
        {byline}
      </span>
    );
  }

  if (isHeader) {
    return (
      <div className={cn("flex min-w-0 items-center gap-2.5 md:gap-3", className)}>
        {showLogo ? (
          <MhmsMark className="h-9 w-9 shrink-0 sm:h-10 sm:w-10 md:h-11 md:w-11" />
        ) : null}
        <div
          suppressHydrationWarning
          className={cn("min-w-0", hideTextOnMobile && "hidden sm:block")}
        >
          {stackedTitle}
        </div>
      </div>
    );
  }

  if (isSidebar) {
    return (
      <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
        {showLogo ? (
          <MhmsMark className="h-10 w-10 shrink-0 md:h-11 md:w-11" />
        ) : null}
        <div className="min-w-0 flex-1">{stackedTitle}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      {showLogo ? (
        <MhmsMark className="h-28 w-28 md:h-32 md:w-32" />
      ) : null}
      <div className={cn("mt-4")}>{stackedTitle}</div>
    </div>
  );
}

/** Home top bar: wordmark + vendor; PNG logo from `md` up only (hidden on mobile). */
export function MtesBrandHeaderLink({
  className,
  showLogo = true,
  hideTextOnMobile = true,
}: {
  className?: string;
  showLogo?: boolean;
  hideTextOnMobile?: boolean;
}) {
  return (
    <Link href="/" className={cn("min-w-0 shrink hover:opacity-90", className)}>
      <MtesBrandLockup
        variant="header"
        showLogo={showLogo}
        hideTextOnMobile={hideTextOnMobile}
      />
    </Link>
  );
}
