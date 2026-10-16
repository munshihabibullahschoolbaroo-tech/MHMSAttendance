"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function NotFound() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-background p-4 text-center text-foreground">
      <meta httpEquiv="refresh" content="0;url=/" />
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin text-blue-600 dark:text-blue-400" />
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Redirecting to home...
        </p>
      </div>
    </div>
  );
}
