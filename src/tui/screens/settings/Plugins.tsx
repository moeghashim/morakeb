import React from 'react';
import { Box, Text } from 'ink';
import { useDB } from '../../context/db';
import { useNavigation } from '../../context/navigation';
import { Header } from '../../ui/Header';
import { SelectMenu } from '../../controls/SelectMenu';
import { SelectItem } from '../../ui/SelectItem';

export function PluginsSettings() {
  const db = useDB();
  const { goBack } = useNavigation();
  const [enabled, setEnabled] = React.useState<boolean>(() => (db.getSetting('example_plugins_enabled') || '').toLowerCase() === 'true');

  const items = [
    { label: enabled ? 'Disable example plugins' : 'Enable example plugins', value: 'toggle-examples' },
    { label: 'Back', value: 'back' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Plugins" />
      <Text>
        <Text bold>Example plugins:</Text>{' '}
        {enabled ? <Text color="green">Enabled ✓</Text> : <Text color="red">Disabled ✗</Text>}
      </Text>
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        onSelect={(item: { value: string }) => {
          if (item.value === 'toggle-examples') {
            const next = !enabled;
            db.setSetting('example_plugins_enabled', next ? 'true' : 'false');
            setEnabled(next);
            return;
          }
          if (item.value === 'back') { goBack(); }
        }}
      />
    </Box>
  );
}
