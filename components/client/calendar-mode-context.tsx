"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { CalendarMode } from "@/lib/date/bs-calendar";

type CtxType = {
  mode: CalendarMode;
  loading: boolean;
  refresh: () => Promise<void>;
  setMode: (mode: CalendarMode) => Promise<void>;
};

const Ctx = React.createContext<CtxType>({
  mode: "ad",
  loading: true,
  refresh: async () => {},
  setMode: async () => {},
});

export function CalendarModeProvider({ children }: { children: React.ReactNode }) {
  const refresh = React.useCallback(async () => {}, []);
  const setMode = React.useCallback(async () => {}, []);

  return (
    <Ctx.Provider value={{ mode: "ad", loading: false, refresh, setMode }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCalendarMode() {
  return React.useContext(Ctx);
}
