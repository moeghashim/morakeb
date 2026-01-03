#!/usr/bin/env bun
import React from 'react';
import {render, useApp, useInput} from 'ink';
import {useSetupController} from './hooks/use-setup-controller';

function SetupApp(): React.ReactElement {
  const {exit} = useApp();
  const {screen, handleInput} = useSetupController({exit});
  useInput(handleInput);
  return <>{screen}</>;
}

const {waitUntilExit} = render(<SetupApp />);
await waitUntilExit;
