import React from 'react';
import { Box, Text } from 'ink';
import { useDB } from '../../context/db';
import { useNavigation } from '../../context/navigation';
import { Header } from '../../ui/Header';
import { SelectMenu } from '../../controls/SelectMenu';
import { SelectItem } from '../../ui/SelectItem';

export function NotificationsSettings() {
  const db = useDB();
  const { goBack } = useNavigation();
  const [sendOnFirst, setSendOnFirst] = React.useState<boolean>(() => (db.getSetting('notify_on_first_snapshot') || '').toLowerCase() === 'true');

  const items = [
    { label: sendOnFirst ? 'Disable send on first snapshot' : 'Enable send on first snapshot', value: 'toggle-first' },
    { label: 'Back', value: 'back' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Notifications" />
      <Text>
        <Text bold>Send on first snapshot:</Text>{' '}
        {sendOnFirst ? <Text color="green">Enabled ✓</Text> : <Text color="red">Disabled ✗</Text>}
      </Text>
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        onSelect={(item: { value: string }) => {
          if (item.value === 'toggle-first') {
            const next = !sendOnFirst; db.setSetting('notify_on_first_snapshot', next ? 'true' : 'false'); setSendOnFirst(next); return;
          }
          if (item.value === 'back') { goBack(); }
        }}
      />
    </Box>
  );
}
