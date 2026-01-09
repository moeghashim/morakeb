import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../controls/SelectMenu';
import { useNavigation } from '../context/navigation';
import { Header } from '../ui/Header';

export function MainMenu() {
  const { navigateTo } = useNavigation();
  const items = [
    { label: 'Add monitor', value: 'add' },
    { label: 'List monitors', value: 'list' },
    { label: 'Notifications', value: 'channels' },
    { label: 'Settings', value: 'settings' },
    { label: 'Exit', value: 'exit' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Morakeb monitor" />
      <SelectMenu
        items={items}
        hint={'Use ↑↓ to navigate, Enter to select, q to quit'}
        onSelect={(item) => {
          switch (item.value) {
            case 'list': navigateTo('list'); break;
            case 'add': navigateTo('add'); break;
            case 'channels': navigateTo('channels'); break;
            case 'settings': navigateTo('settings'); break;
            case 'exit': process.exit(0);
          }
        }}
        showDivider={false}
      />
    </Box>
  );
}
