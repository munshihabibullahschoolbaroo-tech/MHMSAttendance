"use client";

import * as React from "react";
import Link from "next/link";
import { signOut } from "firebase/auth";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { UserAvatar } from "@/components/client/user-avatar";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";
import type { DashboardUser } from "@/components/client/dashboard-user-context";

const itemClass =
  "flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-800 outline-none hover:bg-zinc-100 data-[highlighted]:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10 dark:data-[highlighted]:bg-white/10";

export function UserAccountDropdown({
  user,
  hideAvatar = false,
}: {
  user: DashboardUser;
  hideAvatar?: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex max-w-[min(50vw,240px)] items-center gap-2 rounded-full border border-zinc-200/90 bg-white/90 py-1 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
            hideAvatar ? "px-3.5 py-1.5" : "pl-1 pr-2.5",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          )}
          aria-label="Account menu"
        >
          {!hideAvatar && (
            <UserAvatar
              name={user.name}
              photoUrl={user.photoUrl}
              className="size-8 md:size-8.5 shrink-0"
              textClassName="text-xs"
            />
          )}
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium hidden md:inline-block">{user.name}</span>
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium md:hidden">{user.name.split(" ")[0]?.slice(0, 10)}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            "z-[9999] min-w-[12rem] overflow-hidden rounded-xl border border-zinc-200/90",
            "bg-white/95 p-1 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/95"
          )}
          sideOffset={8}
          align="end"
        >
          <DropdownMenu.Item asChild>
            <Link href="/dashboard/settings" className={itemClass}>
              <Settings className="size-4 text-zinc-500 dark:text-zinc-400" aria-hidden />
              Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-gradient-to-r from-transparent via-zinc-300/80 to-transparent dark:via-white/15" />
          <DropdownMenu.Item
            className={cn(
              itemClass,
              "text-red-600 hover:bg-red-500/10 data-[highlighted]:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15 dark:data-[highlighted]:bg-red-500/15"
            )}
            onSelect={(e) => {
              e.preventDefault();
              void signOut(getFirebaseAuth());
            }}
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
