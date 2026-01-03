#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { DBProvider } from './context/db';
import { NavigationProvider, useNavigation } from './context/navigation';
import { ScreenRouter } from './ScreenRouter';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function AppRoot() {
  useKeyboardShortcuts();
  return <ScreenRouter />;
}

export function runApp() {
  const { waitUntilExit } = render(
    <DBProvider>
      <NavigationProvider>
        <AppRoot />
      </NavigationProvider>
    </DBProvider>
  );
  return waitUntilExit();
}
