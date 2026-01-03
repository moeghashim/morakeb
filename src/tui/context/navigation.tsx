import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Screen, Monitor, NotificationChannel, Change, Snapshot } from '../types';


type NavState = {
  screen: Screen;
  setScreen: (s: Screen) => void;
  navigateTo: (s: Screen) => void;
  selectedMonitor: Monitor | null;
  setSelectedMonitor: (m: Monitor | null) => void;
  selectedChannel: NotificationChannel | null;
  setSelectedChannel: (c: NotificationChannel | null) => void;
  selectedChange: Change | null;
  setSelectedChange: (c: Change | null) => void;
  selectedSnapshot: Snapshot | null;
  setSelectedSnapshot: (s: Snapshot | null) => void;
  formStep: number;
  setFormStep: (n: number) => void;
  currentInput: string;
  setCurrentInput: (s: string) => void;
  goBack: () => void;
  flashes: ReadonlyArray<{ id: number; text: string }>;
  setFlash: (msg: string | null) => void;
  resetTo: (s: Screen) => void;
  getBackHandler: () => (() => boolean) | null;
  setBackHandler: (fn: (() => boolean) | null) => void;
  returnAfterLinkTo: Screen | null;
  setReturnAfterLinkTo: (s: Screen | null) => void;
};

const NavigationContext = createContext<NavState | null>(null);

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('NavigationContext not found');
  return ctx;
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<Screen>('main');
  const [stack, setStack] = useState<Screen[]>(['main']);
  const [selectedMonitor, setSelectedMonitor] = useState<Monitor | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<NotificationChannel | null>(null);
  const [selectedChange, setSelectedChange] = useState<Change | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [formStep, setFormStep] = useState(0);
  const [currentInput, setCurrentInput] = useState('');
  const [flashes, setFlashes] = useState<Array<{ id: number; text: string }>>([]);
  const backHandlerRef = React.useRef<(() => boolean) | null>(null);
  const [returnAfterLinkTo, setReturnAfterLinkTo] = useState<Screen | null>(null);
  const flashTimersRef = React.useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const navigateTo = useCallback((s: Screen) => {
    setStack((prev) => [...prev, s]);
    setScreen(s);
  }, []);

  const goBack = useCallback(() => {
    setFormStep(0);
    setCurrentInput('');

    let targetScreen: Screen;
    if (stack.length <= 1) {
      targetScreen = 'main';
      setStack(['main']);
    } else {
      const newStack = stack.slice(0, -1);
      targetScreen = newStack[newStack.length - 1];
      setStack(newStack);
    }
    setScreen(targetScreen);
  }, [screen, stack]);

  const resetTo = useCallback((s: Screen) => {
    setStack([s]);
    setScreen(s);
    setFormStep(0);
    setCurrentInput('');
  }, []);

  const setFlash = useCallback((msg: string | null) => {
    if (msg === null) {
      flashTimersRef.current.forEach((timer) => clearTimeout(timer));
      flashTimersRef.current.clear();
      setFlashes([]);
      return;
    }
    const id = Date.now() + Math.random();
    setFlashes((prev) => [...prev, { id, text: msg }]);
    const timer = setTimeout(() => {
      setFlashes((prev) => prev.filter((f) => f.id !== id));
      flashTimersRef.current.delete(id);
    }, 5000);
    flashTimersRef.current.set(id, timer);
  }, []);

  React.useEffect(() => {
    return () => {
      flashTimersRef.current.forEach((timer) => clearTimeout(timer));
      flashTimersRef.current.clear();
    };
  }, []);

  const value = useMemo<NavState>(() => ({
    screen,
    setScreen,
    navigateTo,
    selectedMonitor,
    setSelectedMonitor,
    selectedChannel,
    setSelectedChannel,
    selectedChange,
    setSelectedChange,
    selectedSnapshot,
    setSelectedSnapshot,
    formStep,
    setFormStep,
    currentInput,
    setCurrentInput,
    goBack,
    flashes,
    setFlash,
    resetTo,
    getBackHandler: () => backHandlerRef.current,
    setBackHandler: (fn) => { backHandlerRef.current = fn; },
    returnAfterLinkTo,
    setReturnAfterLinkTo,
  }), [screen, formStep, currentInput, flashes, goBack, navigateTo, resetTo, selectedMonitor, selectedChannel, selectedChange, selectedSnapshot, returnAfterLinkTo, setFlash]);

  return (
    <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
  );
}
