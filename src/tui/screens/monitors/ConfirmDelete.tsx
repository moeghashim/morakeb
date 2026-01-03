import React from 'react';
import { Box, Text } from 'ink';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import SelectInput from 'ink-select-input';
import { SelectItem } from '../../ui/SelectItem';
import { Header } from '../../ui/Header';

export function ConfirmDeleteMonitor() {
  const { selectedMonitor, setSelectedMonitor, navigateTo, setFlash, resetTo } = useNavigation();
  const db = useDB();
  if (!selectedMonitor) return null;
  const items = [
    { label: 'Yes, delete this monitor ✓', value: 'confirm' },
    { label: 'No, cancel ✗', value: 'cancel' },
  ];
  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Confirm deletion" />
      <Box marginBottom={1} flexDirection="column">
        <Text>Are you sure you want to delete this monitor?</Text>
        <Box marginTop={1}>
          <Text bold>{selectedMonitor.name}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>This will also delete all snapshots and change history.</Text>
        </Box>
      </Box>
      <SelectInput items={items} itemComponent={SelectItem} onSelect={(item: { value: string }) => {
        if (item.value === 'confirm') {
          db.deleteMonitor(selectedMonitor.id);
          setFlash(`Monitor "${selectedMonitor.name}" deleted ✓`);
          setSelectedMonitor(null);
          resetTo('list');
        } else {
          navigateTo('monitor-detail');
        }
      }} />
    </Box>
  );
}
