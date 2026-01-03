import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../controls/SelectMenu';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { SelectItem } from '../../ui/SelectItem';
import { Header, InfoRow } from '../../ui/Header';

export function LinkedChannels() {
  const { selectedMonitor, navigateTo, goBack, setSelectedChannel } = useNavigation();
  const db = useDB();
  if (!selectedMonitor) return null;
  const linked = db.getMonitorChannels(selectedMonitor.id);
  const items = [
    { label: 'Add channel', value: '__link__' },
    ...linked.map((c) => ({ label: `${c.type}:${c.name} settings`, value: String(c.id) })),
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Notifications" />
      <Box marginBottom={1}>
        <Text dimColor>
          Monitor: {selectedMonitor.name} ({linked.length} channel{linked.length !== 1 ? 's' : ''} linked)
        </Text>
      </Box>
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        onSelect={(item: { value: string }) => {
          if (item.value === '__link__') { navigateTo('add-channels-to-monitor'); return; }
          const ch = linked.find(c => String(c.id) === item.value);
          if (ch) { setSelectedChannel(ch as any); navigateTo('monitor-channel-actions'); }
        }}
      />
    </Box>
  );
}
