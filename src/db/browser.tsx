#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { useInput } from 'ink';
import { DBProvider } from '../tui/context/db';
import { DBNavigationProvider, useDBNavigation } from './browser/context';
import { DBScreenRouter } from './browser/ScreenRouter';

function AppRoot() {
  const { goBack } = useDBNavigation();
  
  useInput((input, key) => {
    if (key.escape || input === 'q' || key.leftArrow) {
      goBack();
    }
  });
  
  return <DBScreenRouter />;
}

export function runBrowser() {
  const { waitUntilExit } = render(
    <DBProvider>
      <DBNavigationProvider>
        <AppRoot />
      </DBNavigationProvider>
    </DBProvider>
  );
  return waitUntilExit();
}

if (import.meta.main) {
  runBrowser();
}
