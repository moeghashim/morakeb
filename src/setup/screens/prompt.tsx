import React from 'react';
import {Text} from 'ink';
import TextInput from 'ink-text-input';
import {Header} from '../../tui/ui/Header';
import {HelpBar} from '../../tui/ui/HelpBar';
import {ScreenLayout, ScreenSection} from './layout';

export type InputScreenProps = {
  title: string;
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  hint?: string;
  description?: React.ReactNode;
  inputKey?: string;
  mask?: string;
};

export function InputScreen({
  title,
  prompt,
  value,
  onChange,
  onSubmit,
  hint = 'Enter to submit, Esc to go back',
  description,
  inputKey,
  mask,
}: InputScreenProps): React.ReactElement {
  return (
    <ScreenLayout>
      <Header title={title} />
      <ScreenSection marginTop={1}>
        {typeof description === 'undefined' ? <Text>{prompt}</Text> : description}
      </ScreenSection>
      <ScreenSection marginTop={1}>
        <TextInput
          key={inputKey}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          mask={mask}
        />
      </ScreenSection>
      <HelpBar text={hint} />
    </ScreenLayout>
  );
}
