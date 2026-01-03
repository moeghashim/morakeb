import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../controls/SelectMenu';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { SelectItem } from '../../ui/SelectItem';

type ChannelItem = {
  label: string;
  value: string;
  channelName?: string;
  channelType?: string;
  active?: boolean;
  isLinked?: boolean;
};

type ChannelSelectItemProps = {
  label: string;
  isSelected?: boolean;
  channelName?: string;
  channelType?: string;
  active?: boolean;
  isLinked?: boolean;
};

function ChannelSelectItem(props: ChannelSelectItemProps) {
  const { label, isSelected, channelName, channelType, active, isLinked } = props;

  // For special items (e.g., Done, toggle-link, add-channel), use normal SelectItem
  if (!channelName) {
    return <SelectItem label={label} isSelected={isSelected} />;
  }

  // For channel items, show a simple checkbox-style indicator
  const prefix = isLinked ? '[x]' : '[ ]';
  const status = active ? 'Active' : 'Inactive';
  return (
    <Text color={isSelected ? 'cyan' : undefined}>
      {prefix} {channelName} [{channelType}] — {status}
    </Text>
  );
}

export function LinkChannel() {
  const { selectedMonitor, navigateTo, setFlash, resetTo, returnAfterLinkTo, setReturnAfterLinkTo, setBackHandler } = useNavigation();
  const db = useDB();
  const [refreshKey, setRefreshKey] = React.useState(0);
  
  if (!selectedMonitor) return null;
  
  const channels = db.listNotificationChannels();
  const linkedChannels = db.getMonitorChannels(selectedMonitor.id);

  const includeLabel = selectedMonitor.includeLink ? 'Disable link in summaries' : 'Enable link in summaries';
  const items: ChannelItem[] = [];
  // When arriving from onboarding, offer a clear way to finish
  if (returnAfterLinkTo) {
    items.push({ label: 'Done', value: 'done' });
  }
  // Always offer a clear add/manage flow using the immediate toggle screen
  items.push({ label: 'Manage notifications', value: 'manage-channels' });
  items.push({ label: includeLabel, value: 'toggle-link' });
  if (channels.length === 0) {
    items.push({ label: 'Add notification channel', value: 'add-channel' });
  }

  // If we're in onboarding (returnAfterLinkTo set), pressing ESC/Back should behave like Done
  React.useEffect(() => {
    if (!returnAfterLinkTo) return;
    const handler = () => {
      resetTo(returnAfterLinkTo);
      setReturnAfterLinkTo(null);
      return true; // handled
    };
    setBackHandler(handler);
    return () => setBackHandler(null);
  }, [returnAfterLinkTo, resetTo, setBackHandler, setReturnAfterLinkTo]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Link channel to: {selectedMonitor.name}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>
          <Text bold>Include link in summaries:</Text>{' '}
          {selectedMonitor.includeLink ? <Text color="green">Yes ✓</Text> : <Text color="red">No ✗</Text>}
        </Text>
      </Box>
      {linkedChannels.length > 0 && (
        <Box flexDirection="column">
          <Text bold>Linked channels:</Text>
          {linkedChannels.map(c => (
            <Text key={String(c.id)}>  • {c.name} [{c.type}] {c.active ? <Text color="green">[Active ✓]</Text> : <Text color="red">[Inactive ✗]</Text>}</Text>
          ))}
        </Box>
      )}
      <SelectMenu
        items={items}
        itemComponent={ChannelSelectItem}
        onSelect={(item: { value: string }) => {
          if (item.value === 'done') {
            if (returnAfterLinkTo) {
              resetTo(returnAfterLinkTo);
              setReturnAfterLinkTo(null);
              return;
            }
          }
          if (item.value === 'toggle-link') {
            const next = selectedMonitor.includeLink ? false : true;
            db.updateMonitor(selectedMonitor.id, { includeLink: next });
            (selectedMonitor as any).includeLink = next;
            return;
          }
          if (item.value === 'add-channel') {
            navigateTo('add-channel');
            return;
          }
          if (item.value === 'manage-channels') {
            navigateTo('add-channels-to-monitor');
            return;
          }
        }}
      />
    </Box>
  );
}
