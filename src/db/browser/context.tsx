import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

type DBScreen = 
  | 'table-list'
  | 'table-viewer'
  | 'row-editor'
  | 'confirm-delete-row';

type DBNavState = {
  screen: DBScreen;
  navigateTo: (s: DBScreen) => void;
  goBack: () => void;
  selectedTable: string | null;
  setSelectedTable: (t: string | null) => void;
  selectedRow: any | null;
  setSelectedRow: (r: any | null) => void;
  currentPage: number;
  setCurrentPage: (p: number) => void;
  flash: string | null;
  setFlash: (msg: string | null) => void;
};

const DBNavigationContext = createContext<DBNavState | null>(null);

export function useDBNavigation() {
  const ctx = useContext(DBNavigationContext);
  if (!ctx) throw new Error('DBNavigationContext not found');
  return ctx;
}

export function DBNavigationProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<DBScreen>('table-list');
  const [stack, setStack] = useState<DBScreen[]>(['table-list']);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  const navigateTo = useCallback((s: DBScreen) => {
    setStack((prev) => [...prev, s]);
    setScreen(s);
  }, []);

  const goBack = useCallback(() => {
    let targetScreen: DBScreen;
    if (stack.length <= 1) {
      targetScreen = 'table-list';
      setStack(['table-list']);
    } else {
      const newStack = stack.slice(0, -1);
      targetScreen = newStack[newStack.length - 1];
      setStack(newStack);
    }
    setScreen(targetScreen);
  }, [stack]);

  const value = useMemo<DBNavState>(() => ({
    screen,
    navigateTo,
    goBack,
    selectedTable,
    setSelectedTable,
    selectedRow,
    setSelectedRow,
    currentPage,
    setCurrentPage,
    flash,
    setFlash,
  }), [screen, navigateTo, goBack, selectedTable, selectedRow, currentPage, flash]);

  return (
    <DBNavigationContext.Provider value={value}>
      {children}
    </DBNavigationContext.Provider>
  );
}
