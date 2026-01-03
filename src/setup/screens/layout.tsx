import React from 'react';
import {Box} from 'ink';

type Direction = 'column' | 'row';

export type ScreenLayoutProps = {
  children: React.ReactNode;
  padding?: number;
  direction?: Direction;
};

export function ScreenLayout({
  children,
  padding = 1,
  direction = 'column',
}: ScreenLayoutProps): React.ReactElement {
  return (
    <Box padding={padding} flexDirection={direction}>
      {children}
    </Box>
  );
}

export type ScreenSectionProps = {
  children: React.ReactNode;
  marginTop?: number;
  direction?: Direction;
};

export function ScreenSection({
  children,
  marginTop = 1,
  direction = 'column',
}: ScreenSectionProps): React.ReactElement {
  return (
    <Box marginTop={marginTop} flexDirection={direction}>
      {children}
    </Box>
  );
}
