"use client";

import * as React from "react";
import { nameToInitials } from "@/lib/profile/initials";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  name: string;
  photoUrl?: string | null;
  className?: string;
  textClassName?: string;
  alt?: string;
};

export function UserAvatar({
  name,
  photoUrl,
  className,
  textClassName,
  alt,
}: UserAvatarProps) {
  const [imgError, setImgError] = React.useState(false);

  // Reset error state if photoUrl changes
  React.useEffect(() => {
    setImgError(false);
  }, [photoUrl]);

  const initials = nameToInitials(name || "User");
  const cleanPhotoUrl = typeof photoUrl === "string" ? photoUrl.trim() : null;

  if (cleanPhotoUrl && !imgError) {
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800",
          className
        )}
      >
        <img
          src={cleanPhotoUrl}
          alt={alt || name || "User profile photo"}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="h-full w-full rounded-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full",
        "bg-gradient-to-br from-violet-600 to-cyan-500 font-semibold text-white shadow-xs",
        className
      )}
      aria-label={name || "User avatar"}
    >
      <span className={cn("leading-none", textClassName)}>{initials}</span>
    </span>
  );
}
