import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../controls/SelectMenu';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { Header } from '../../ui/Header';
import { resolveNotificationChannelPlugin } from '../../../lib/channel';

export function ChannelsList() {
  const { navigateTo, setSelectedChannel } = useNavigation();
  const db = useDB();
  const channels = db.listNotificationChannels();
  const items = channels.map((c) => {
    const plugin = resolveNotificationChannelPlugin(c.type);
    const typeLabel = plugin?.label ?? c.type;
    return { label: `${c.name} [${typeLabel}]  ${c.active ? 'Active ✓' : 'Inactive ✗'}`, value: String(c.id) };
  });
  items.push({ label: 'Add channel', value: 'add' });

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Notification channels (${channels.length})`} />
      {channels.length === 0 ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>No notification channels yet. Add one to get started!</Text>
          </Box>
        </Box>
      ) : null}
      <SelectMenu
        items={items}
        showDivider={false}
        onSelect={(item: { value: string }) => {
          if (item.value === 'add') {
            navigateTo('add-channel');
            return;
          }
          const chan = channels.find(c => String(c.id) === item.value);
          if (chan) {
            setSelectedChannel(chan);
            navigateTo('channel-detail');
          }
        }}
      />
    </Box>
  );
}
