import React from 'react';
import {Box, Text} from 'ink';
import {ScreenSection} from './layout';
import type {Mode, RunMode} from '../types';

export type SummaryPanelProps = {
  mode: Mode;
  runMode: RunMode | null;
};

export function SummaryPanel({mode, runMode}: SummaryPanelProps): React.ReactElement {
  const next: string[] = [];
  if (mode === 'vps' && runMode === 'background') {
    next.push('systemctl status changes');
    next.push('journalctl -u changes -f');
  } else {
    next.push('bun start');
  }
  next.push('bun changes');
  next.push('droid   # first run to authenticate');

  return (
    <ScreenSection marginTop={1}>
      <Text>Next steps:</Text>
      <Box flexDirection="column">
        {next.map((n, index) => (
          <Text key={index}>- {n}</Text>
        ))}
      </Box>
    </ScreenSection>
  );
}
