import React from 'react';
import { Box, Text } from 'ink';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import SelectInput from 'ink-select-input';
import { SelectItem } from '../../ui/SelectItem';
import { Header } from '../../ui/Header';

export function ConfirmDeleteChannel() {
  const { selectedChannel, setSelectedChannel, navigateTo } = useNavigation();
  const db = useDB();
  if (!selectedChannel) return null;
  const items = [
    { label: 'Yes, delete this channel ✓', value: 'confirm' },
    { label: 'No, cancel ✗', value: 'cancel' },
  ];
  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Confirm deletion" />
      <Box marginBottom={1} flexDirection="column">
        <Text>Are you sure you want to delete this notification channel?</Text>
        <Box marginTop={1}>
          <Text bold>{selectedChannel.name}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>This will unlink it from all monitors.</Text>
        </Box>
      </Box>
      <SelectInput items={items} itemComponent={SelectItem} onSelect={(item: { value: string }) => {
        if (item.value === 'confirm') {
          db.deleteNotificationChannel(selectedChannel.id);
          setSelectedChannel(null);
          navigateTo('channels');
        } else {
          navigateTo('channel-detail');
        }
      }} />
    </Box>
  );
}
