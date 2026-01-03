import React from 'react';
import { Box, Text } from 'ink';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { Header } from '../../ui/Header';
import { SelectMenu } from '../../controls/SelectMenu';
import { NotificationService } from '../../../lib/notifier';
import { resolvePlugin } from '../../../lib/plugins/registry';

type Item = { label: string; value: string; channelId?: number };

function ChannelItem({ label, isSelected }: { label: string; isSelected?: boolean }) {
  return <Text color={isSelected ? 'cyan' : undefined}>{label}</Text>;
}

export function ResendChangeChannels() {
  const { selectedMonitor, selectedChange, setFlash, goBack } = useNavigation();
  const db = useDB();
  const [busy, setBusy] = React.useState(false);

  if (!selectedMonitor || !selectedChange) {
    goBack();
    return null;
  }

  const linked = db.getMonitorChannels(selectedMonitor.id);
  const initialSelected = React.useMemo(() => new Set<number>(linked.map((c) => c.id as number)), [linked.length]);
  const [selected, setSelected] = React.useState<Set<number>>(initialSelected);

  const buildItems = React.useCallback((): Item[] => {
    const items: Item[] = [];
    if (linked.length === 0) {
      items.push({ label: 'No channels linked', value: '__noop__' });
      items.push({ label: 'Back', value: '__back__' });
      return items;
    }

    items.push({ label: busy ? 'Send to selected (busy…)' : 'Send to selected', value: '__send__' });
    items.push({ label: 'Select all', value: '__all__' });
    items.push({ label: 'Deselect all', value: '__none__' });

    for (const c of linked) {
      const id = c.id as number;
      const isSel = selected.has(id);
      const check = isSel ? '[x]' : '[ ]';
      const st = c.active ? 'Active' : 'Inactive';
      items.push({ label: `${check} ${c.type}:${c.name} — ${st}`, value: String(id), channelId: id });
    }

    items.push({ label: 'Back', value: '__back__' });
    return items;
  }, [linked.length, selected, busy]);

  const [items, setItems] = React.useState<Item[]>(buildItems());
  React.useEffect(() => { setItems(buildItems()); }, [buildItems]);

  const onSend = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const activeLinked = db.getMonitorChannels(selectedMonitor.id, true);
      const chosen = activeLinked.filter((c) => selected.has(c.id as number));
      if (chosen.length === 0) {
        setFlash('No active selected channels');
        return;
      }
      const { plugin, options } = resolvePlugin(selectedMonitor, db);
      const displayUrl = plugin?.linkForPrompt?.({ monitor: selectedMonitor, options });
      const svc = new NotificationService(db);
      const results = await svc.sendNotifications(selectedChange, selectedMonitor, chosen, displayUrl, { allowRepeat: true });
      const sent = results.filter((r) => r.ok).length;
      const failed = results.length - sent;
      setFlash(failed > 0 ? `Sent ${sent}/${results.length}; ${failed} failed` : `Notifications sent ✓ (${sent}/${results.length})`);
      goBack();
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      setFlash(`Failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Resend to selected channels — ${selectedMonitor.name}`} />
      <Box marginBottom={1}>
        <Text dimColor>Change: {selectedChange.summary ?? 'n/a'}</Text>
      </Box>
      <SelectMenu
        items={items}
        itemComponent={ChannelItem}
        hint={'Use ↑↓ to navigate, Enter to toggle; choose "Send to selected" to notify'}
        onSelect={(it: Item) => {
          if (it.value === '__send__') { onSend(); return; }
          if (it.value === '__all__') { setSelected(new Set(linked.map((c) => c.id as number))); return; }
          if (it.value === '__none__') { setSelected(new Set()); return; }
          if (it.value === '__back__') { goBack(); return; }

          const id = Number(it.value);
          if (!Number.isNaN(id)) {
            const next = new Set(selected);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelected(next);
          }
        }}
      />
    </Box>
  );
}
