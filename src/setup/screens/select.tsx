import React from 'react';
import {Header} from '../../tui/ui/Header';
import {SelectMenu} from '../../tui/controls/SelectMenu';
import {SelectItem} from '../../tui/ui/SelectItem';
import {HelpBar} from '../../tui/ui/HelpBar';
import {ScreenLayout, ScreenSection} from './layout';

export type SelectOption<TValue extends string> = {
  label: string;
  value: TValue;
};

export type SelectScreenProps<TValue extends string> = {
  title: string;
  items: SelectOption<TValue>[];
  hint: string;
  onSelect: (item: SelectOption<TValue>) => void;
  description?: React.ReactNode;
  itemComponent?: React.ComponentType<{label: string; isSelected?: boolean}>;
  showDivider?: boolean;
};

export function SelectScreen<TValue extends string>({
  title,
  items,
  hint,
  onSelect,
  description,
  itemComponent = SelectItem,
  showDivider = false,
}: SelectScreenProps<TValue>): React.ReactElement {
  return (
    <ScreenLayout>
      <Header title={title} />
      {description ? <ScreenSection marginTop={1}>{description}</ScreenSection> : null}
      <SelectMenu
        items={items}
        itemComponent={itemComponent}
        showDivider={showDivider}
        hint={hint}
        onSelect={(item: SelectOption<TValue>) => {
          onSelect(item);
        }}
      />
    </ScreenLayout>
  );
}

export type PassiveScreenProps = {
  title: string;
  hint: string;
  children: React.ReactNode;
};

export function PassiveScreen({title, hint, children}: PassiveScreenProps): React.ReactElement {
  return (
    <ScreenLayout>
      <Header title={title} />
      <ScreenSection marginTop={1}>{children}</ScreenSection>
      <HelpBar text={hint} />
    </ScreenLayout>
  );
}
