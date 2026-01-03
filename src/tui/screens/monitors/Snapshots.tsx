import React from 'react';
import { Box, Text } from 'ink';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { Header } from '../../ui/Header';
import { SelectMenu } from '../../controls/SelectMenu';

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return 'unknown time';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleString();
}

export function MonitorSnapshots() {
  const { selectedMonitor, navigateTo, goBack, setSelectedSnapshot } = useNavigation();
  const db = useDB();

  if (!selectedMonitor) {
    goBack();
    return null;
  }

  const snaps = db.listSnapshots(selectedMonitor.id, 20);
  const firstSnapshot = snaps.length > 0 ? snaps[snaps.length - 1] : null; // oldest

  const items: Array<{ label: string; value: string } > = [];
  if (firstSnapshot) {
    items.push({ label: `→ Create test change from FIRST snapshot (${formatTimestamp(firstSnapshot.createdAt)})`, value: `first:${firstSnapshot.id}` });
  }
  for (const s of snaps) {
    const labelParts = [formatTimestamp(s.createdAt)];
    if (s.releaseVersion) labelParts.push(`• ${s.releaseVersion}`);
    items.push({ label: labelParts.join(' '), value: String(s.id) });
  }
  items.push({ label: 'Back', value: '__back__' });

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Recent snapshots: ${selectedMonitor.name}`} />
      {snaps.length === 0 ? (
        <Box marginBottom={1}><Text dimColor>No snapshots yet.</Text></Box>
      ) : (
        <Box marginBottom={1}><Text dimColor>{snaps.length} snapshot{snaps.length === 1 ? '' : 's'} shown (latest first)</Text></Box>
      )}
      <SelectMenu
        items={items}
        showDivider={false}
        onSelect={(item: { value: string }) => {
          if (item.value === '__back__') { goBack(); return; }
          if (item.value.startsWith('first:')) {
            const id = item.value.split(':')[1];
            const snap = snaps.find((s) => String(s.id) === id);
            if (snap) {
              setSelectedSnapshot(snap);
              navigateTo('snapshot-actions');
            }
            return;
          }
          const snap = snaps.find((s) => String(s.id) === item.value);
          if (snap) {
            setSelectedSnapshot(snap);
            navigateTo('snapshot-actions');
          }
        }}
      />
    </Box>
  );
}
