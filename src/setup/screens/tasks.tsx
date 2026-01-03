import React from 'react';
import {Box, Text} from 'ink';
import {Header} from '../../tui/ui/Header';
import {HelpBar} from '../../tui/ui/HelpBar';
import type {TaskResult} from '../types';
import {ScreenLayout, ScreenSection} from './layout';

export type DisplayTask = {
  key: string;
  title: string;
};

type ResultMap = Record<string, TaskResult | undefined>;

export type TaskProgressScreenProps = {
  spinnerFrame: string;
  tasks: DisplayTask[];
  results: ResultMap;
  hint: string;
};

export function TaskProgressScreen({
  spinnerFrame,
  tasks,
  results,
  hint,
}: TaskProgressScreenProps): React.ReactElement {
  return (
    <ScreenLayout>
      <Header title={`Running setup ${spinnerFrame}`} />
      <ScreenSection marginTop={1}>
        <Box flexDirection="column">
          {tasks.map((task) => (
            <Text key={task.key}>
              {task.title}: {results[task.key] ?? 'pending'}
            </Text>
          ))}
        </Box>
      </ScreenSection>
      <HelpBar text={hint} />
    </ScreenLayout>
  );
}

export type TaskSummaryScreenProps = {
  tasks: DisplayTask[];
  results: Record<string, TaskResult>;
  notes: Record<string, string>;
  summary: React.ReactNode;
  hint: string;
};

export function TaskSummaryScreen({
  tasks,
  results,
  notes,
  summary,
  hint,
}: TaskSummaryScreenProps): React.ReactElement {
  return (
    <ScreenLayout>
      <Header title="Setup complete" />
      <ScreenSection marginTop={1}>
        <Box flexDirection="column">
          {tasks.map((task) => (
            <Text key={task.key}>
              {task.title}: {results[task.key]}
            </Text>
          ))}
        </Box>
      </ScreenSection>
      {Object.keys(notes).length > 0 ? (
        <ScreenSection marginTop={1}>
          <Text bold>Notes:</Text>
          <Box flexDirection="column">
            {Object.entries(notes).map(([key, value]) => (
              <Text key={key}>- {value}</Text>
            ))}
          </Box>
        </ScreenSection>
      ) : null}
      <ScreenSection marginTop={1}>{summary}</ScreenSection>
      <HelpBar text={hint} />
    </ScreenLayout>
  );
}
