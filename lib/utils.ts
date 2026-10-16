import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function resolveDocumentViewUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("https://") && url.includes(".private.blob.vercel-storage.com")) {
    return `/api/blob/view?url=${encodeURIComponent(url)}`;
  }
  return url;
}
