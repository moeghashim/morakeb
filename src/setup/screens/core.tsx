import React from 'react';
import {Text} from 'ink';
import {SelectMenu} from '../../tui/controls/SelectMenu';
import {SelectItem} from '../../tui/ui/SelectItem';
import {HelpBar} from '../../tui/ui/HelpBar';
import {Header} from '../../tui/ui/Header';
import {ScreenLayout, ScreenSection} from './layout';
import {PassiveScreen, SelectOption, SelectScreen} from './select';

export type ModeScreenProps<TValue extends string> = {
  options: SelectOption<TValue>[];
  onSelect: (item: SelectOption<TValue>) => void;
  hint: string;
};

export function ModeScreen<TValue extends string>({
  options,
  onSelect,
  hint,
}: ModeScreenProps<TValue>): React.ReactElement {
  return (
    <SelectScreen
      title="Setup"
      items={options}
      hint={hint}
      onSelect={onSelect}
    />
  );
}

export type RunModeScreenProps<TValue extends string> = {
  options: SelectOption<TValue>[];
  onSelect: (item: SelectOption<TValue>) => void;
  hint: string;
};

export function RunModeScreen<TValue extends string>({
  options,
  onSelect,
  hint,
}: RunModeScreenProps<TValue>): React.ReactElement {
  return (
    <SelectScreen
      title="Choose run mode"
      items={options}
      hint={hint}
      onSelect={onSelect}
    />
  );
}

export type DiagnosticsAction<TValue extends string> = SelectOption<TValue>;

export type DiagnosticsScreenProps<TValue extends string> = {
  infoLines: string[];
  actions: DiagnosticsAction<TValue>[];
  onSelectAction: (item: DiagnosticsAction<TValue>) => void;
  fallbackHint: string;
  actionHint: string;
};

export function DiagnosticsScreen<TValue extends string>({
  infoLines,
  actions,
  onSelectAction,
  fallbackHint,
  actionHint,
}: DiagnosticsScreenProps<TValue>): React.ReactElement {
  return (
    <ScreenLayout>
      <Header title="Diagnostics" />
      <ScreenSection marginTop={1}>
        {infoLines.map((line, index) => (
          <Text key={index}>{line}</Text>
        ))}
      </ScreenSection>
      {actions.length > 0 ? (
        <ScreenSection marginTop={1}>
          <SelectMenu
            items={actions}
            itemComponent={SelectItem}
            showDivider={false}
            hint={actionHint}
            onSelect={onSelectAction}
          />
        </ScreenSection>
      ) : (
        <ScreenSection marginTop={1}>
          <HelpBar text={fallbackHint} />
        </ScreenSection>
      )}
    </ScreenLayout>
  );
}

export type ConfirmRollbackScreenProps<TValue extends string> = {
  options: SelectOption<TValue>[];
  onSelect: (item: SelectOption<TValue>) => void;
  hint: string;
};

export function ConfirmRollbackScreen<TValue extends string>({
  options,
  onSelect,
  hint,
}: ConfirmRollbackScreenProps<TValue>): React.ReactElement {
  return (
    <SelectScreen
      title="Confirm removal"
      items={options}
      hint={hint}
      onSelect={onSelect}
      description={
        <Text>
          This will remove the systemd service, .env, data directory, and node_modules in this directory.
        </Text>
      }
    />
  );
}

export type DeployOptionsScreenProps<TValue extends string> = {
  debugEnabled: boolean;
  items: SelectOption<TValue>[];
  onSelect: (item: SelectOption<TValue>) => void;
  hint: string;
};

export function DeployOptionsScreen<TValue extends string>({
  debugEnabled,
  items,
  onSelect,
  hint,
}: DeployOptionsScreenProps<TValue>): React.ReactElement {
  const title = `Deploy to VPS${debugEnabled ? ': debug mode' : ''}`;
  return (
    <SelectScreen
      title={title}
      items={items}
      hint={hint}
      onSelect={onSelect}
    />
  );
}

export type PassiveNoticeScreenProps = {
  title: string;
  hint: string;
  children: React.ReactNode;
};

export const PassiveNoticeScreen = PassiveScreen;
