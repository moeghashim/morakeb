import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../controls/SelectMenu';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { SelectItem } from '../../ui/SelectItem';
import { Header } from '../../ui/Header';


export function MonitorDetail() {
  const { selectedMonitor, setSelectedMonitor, navigateTo, setFormStep, setCurrentInput, setSelectedChange } = useNavigation();
  const db = useDB();

  React.useEffect(() => {}, []);

  if (!selectedMonitor) return null;

  const linked = db.getMonitorChannels(selectedMonitor.id);
  const notifLabel = linked.length > 0 ? `Notifications (${linked.length})` : 'Notifications';

  function ago(ts?: string | null): string {
    if (!ts) return 'never';
    const d = new Date(ts);
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    return `${days}d ago`;
  }

  function middleTruncate(str: string, max = 70): string {
    if (str.length <= max) return str;
    const keep = Math.floor((max - 1) / 2);
    return str.slice(0, keep) + '…' + str.slice(-keep);
  }

  const lastChange = (() => {
    try { const c = db.listChangesByMonitor(selectedMonitor.id, 1); return c[0]?.createdAt || null; } catch { return null; }
  })();

  const items = [
    { label: 'Edit monitor', value: 'edit' },
    { label: notifLabel, value: 'notifications' },
    { label: 'Recent changes', value: 'changes' },
    { label: 'Recent snapshots', value: 'snapshots' },
    { label: selectedMonitor.active ? 'Pause monitor' : 'Resume monitor', value: 'toggle' },
    { label: 'Delete monitor', value: 'delete' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Monitor details: ${selectedMonitor.name}`} />
      <Box flexDirection="column">
        <Text>
          <Text bold>Status:</Text>{' '}
          {selectedMonitor.active ? <Text color="green">Active ✓</Text> : <Text color="red">Paused</Text>}
        </Text>
        <Text>
          <Text bold>URL:</Text>{' '}<Text dimColor>{middleTruncate(selectedMonitor.url, 80)}</Text>
        </Text>
        <Text dimColor>
          checks every {selectedMonitor.intervalMinutes}m · last check {ago(selectedMonitor.lastCheckedAt)} · last change {ago(lastChange)}
        </Text>
      </Box>
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        onSelect={(item: { value: string }) => {
          switch (item.value) {
            case 'edit': {
              setFormStep(0);
              setCurrentInput(selectedMonitor.name);
              navigateTo('edit-monitor');
              return;
            }
            case 'notifications': { navigateTo('view-linked-channels'); return; }
            case 'changes': {
              setSelectedChange(null);
              navigateTo('monitor-changes');
              return;
            }
            case 'snapshots': {
              navigateTo('monitor-snapshots');
              return;
            }
            case 'toggle': {
              const next = selectedMonitor.active ? false : true;
              db.updateMonitor(selectedMonitor.id, { active: next });
              setSelectedMonitor({ ...selectedMonitor, active: next });
              return;
            }
            case 'delete': {
              navigateTo('confirm-delete-monitor');
              return;
            }
          }
        }}
      />
    </Box>
  );
}
