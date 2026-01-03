import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../controls/SelectMenu';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { Header } from '../../ui/Header';
import { SelectItem } from '../../ui/SelectItem';

export function ConfirmUnlinkMonitorChannel() {
  const { selectedMonitor, selectedChannel, setSelectedChannel, navigateTo, goBack, setFlash, resetTo } = useNavigation();
  const db = useDB();
  if (!selectedMonitor || !selectedChannel) return null;

  const items = [
    { label: 'Yes, unlink this channel ✓', value: 'confirm' },
    { label: 'Cancel', value: 'cancel' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Unlink channel" />
      <Box>
        <Text>Monitor: <Text bold>{selectedMonitor.name}</Text></Text>
      </Box>
      <Box>
        <Text>Channel: <Text bold>{selectedChannel.name}</Text> [{selectedChannel.type}]</Text>
      </Box>
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        onSelect={(item: { value: string }) => {
          if (item.value === 'confirm') {
            const ok = db.removeChannelFromMonitor(selectedMonitor.id, selectedChannel.id);
            if (ok) setFlash(`Unlinked ${selectedChannel.name} ✓`);
            setSelectedChannel(null);
            // Replace stack so back does not return to this confirm screen
            resetTo('view-linked-channels');
            return;
          }
          if (item.value === 'cancel') { setSelectedChannel(null); goBack(); return; }
        }}
      />
    </Box>
  );
}
