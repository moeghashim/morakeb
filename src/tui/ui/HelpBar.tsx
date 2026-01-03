import React from 'react';
import { Box, Text } from 'ink';

export const DEFAULT_HINT = 'Use ↑↓ to navigate, Enter to select';

export function HelpBar({ text = DEFAULT_HINT }: { text?: string }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>{text}</Text>
    </Box>
  );
}
