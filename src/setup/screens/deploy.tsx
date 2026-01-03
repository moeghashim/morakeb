import React from 'react';
import {Box, Text} from 'ink';
import {Header} from '../../tui/ui/Header';
import {SelectMenu} from '../../tui/controls/SelectMenu';
import {SelectItem} from '../../tui/ui/SelectItem';
import {HelpBar} from '../../tui/ui/HelpBar';
import {ScreenLayout, ScreenSection} from './layout';
import type {SelectOption} from './select';

export type DeployProgressScreenProps = {
  status: 'idle' | 'running' | 'failed' | 'success';
  debugMode: boolean;
  debugLogPath: string;
  spinnerFrame: string;
  host: string;
  dest: string;
  currentStage: string | null;
  errorMessage: string | null;
  helpText: string;
  titlePrefix?: string;
};

export function DeployProgressScreen({
  status,
  debugMode,
  debugLogPath,
  spinnerFrame,
  host,
  dest,
  currentStage,
  errorMessage,
  helpText,
  titlePrefix = 'Deploy',
}: DeployProgressScreenProps): React.ReactElement {
  const isActive = status === 'running' || status === 'idle';
  const baseTitle = `${titlePrefix}${status === 'failed' ? ' failed' : isActive ? 'ing' : ' complete'}`;
  const title = isActive ? `${baseTitle}... ${spinnerFrame}${debugMode ? ' (debug mode)' : ''}` : `${baseTitle}${debugMode ? ' (debug mode)' : ''}`;
  const stageLine = currentStage
    ? status === 'failed'
      ? `Failed: ${currentStage}`
      : `${currentStage}${status === 'running' ? '...' : ''}`
    : null;
  return (
    <ScreenLayout>
      <Header title={title} />
      {debugMode ? <Text dimColor>Logging to: {debugLogPath}</Text> : null}
      <Box flexDirection="column">
        <Text dimColor>
          {titlePrefix} → host: {host}, dest: {dest}
        </Text>
        {stageLine ? <Text>{stageLine}</Text> : null}
        {errorMessage ? <Text color="red">Error: {errorMessage}</Text> : null}
      </Box>
      <HelpBar text={helpText} />
    </ScreenLayout>
  );
}

export type DeployCompleteScreenProps<TValue extends string> = {
  host: string;
  dest: string;
  items: SelectOption<TValue>[];
  onSelect: (item: SelectOption<TValue>) => void;
  hint: string;
  showWorkflowPrompt?: boolean;
};

export function DeployCompleteScreen<TValue extends string>({
  host,
  dest,
  items,
  onSelect,
  hint,
  showWorkflowPrompt = true,
}: DeployCompleteScreenProps<TValue>): React.ReactElement {
  return (
    <ScreenLayout>
      <Header title="Deploy Complete" />
      <ScreenSection marginTop={1}>
        <Text color="green">✓ Deployed to {host}:{dest}</Text>
      </ScreenSection>
      <ScreenSection marginTop={0}>
        <Text color="green">✓ Service running on VPS (port 3000)</Text>
      </ScreenSection>
      {showWorkflowPrompt ? (
        <>
          <ScreenSection marginTop={1}>
            <Text>Setup GitHub Actions auto-deploy?</Text>
          </ScreenSection>
          <ScreenSection marginTop={0}>
            <Text dimColor>Automatically deploy on every push to main</Text>
          </ScreenSection>
        </>
      ) : null}
      <ScreenSection marginTop={1}>
        <SelectMenu
          items={items}
          itemComponent={SelectItem}
          showDivider={false}
          hint={hint}
          onSelect={onSelect}
        />
      </ScreenSection>
    </ScreenLayout>
  );
}
