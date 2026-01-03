import React from 'react';
import { Box, Text } from 'ink';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { SelectMenu } from '../../controls/SelectMenu';

type Item = { label: string; value: string; channelId?: number };

function ChannelItem({ label, isSelected }: { label: string; isSelected?: boolean }) {
  return <Text color={isSelected ? 'cyan' : undefined}>{label}</Text>;
}

export function AddChannelsToMonitor() {
  const { selectedMonitor, goBack, setFlash, navigateTo } = useNavigation();
  const db = useDB();

  if (!selectedMonitor) return null;

  const all = db.listNotificationChannels();
  const linked = db.getMonitorChannels(selectedMonitor.id);
  const linkedIds = new Set(linked.map((c) => c.id as number));
  const [selected, setSelected] = React.useState<Set<number>>(new Set(linkedIds));

  const buildItems = (): Item[] => {
    const items: Item[] = [];

    // If no channels exist, show option to create one
    if (all.length === 0) {
      items.push({ label: 'Add notification channel', value: '__add__' });
      return items;
    }

    for (const c of all) {
      const isSel = selected.has(c.id as number);
      const check = isSel ? '[x]' : '[ ]';
      const st = c.active ? 'Active' : 'Inactive';
      items.push({ label: `${check} ${c.type}:${c.name} — ${st}`, value: String(c.id), channelId: c.id as number });
    }
    return items;
  };

  const [items, setItems] = React.useState<Item[]>(buildItems());

  React.useEffect(() => { setItems(buildItems()); }, [all.length, selected.size]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}><Text bold color="cyan">Add notifications to: {selectedMonitor.name}</Text></Box>
      {all.length === 0 && (
        <Box marginBottom={1}>
          <Text color="yellow">No notification channels configured yet.</Text>
        </Box>
      )}
      <SelectMenu
        items={items}
        itemComponent={ChannelItem}
        hint={'Use ↑↓ to navigate, Enter to select'}
        onSelect={(it: Item) => {
          if (it.value === '__add__') {
            navigateTo('add-channel');
            return;
          }

          const id = Number(it.value);
          if (!Number.isNaN(id)) {
            const next = new Set(selected);
            const wasSelected = next.has(id);

            if (wasSelected) {
              next.delete(id);
              db.removeChannelFromMonitor(selectedMonitor.id, id);
              setFlash('Channel unlinked ✓');
            } else {
              next.add(id);
              db.linkChannelToMonitor(selectedMonitor.id, id);
              setFlash('Channel linked ✓');
            }

            setSelected(next);
          }
        }}
      />
    </Box>
  );
}
