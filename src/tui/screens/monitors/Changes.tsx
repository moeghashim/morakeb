import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../controls/SelectMenu';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { Header } from '../../ui/Header';

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return 'unknown time';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleString();
}

export function MonitorChanges() {
  const { selectedMonitor, navigateTo, goBack, setSelectedChange } = useNavigation();
  const db = useDB();

  if (!selectedMonitor) {
    goBack();
    return null;
  }

  const changes = db.listChangesByMonitor(selectedMonitor.id, 20);
  const items = changes.map((change) => {
    const ts = formatTimestamp(change.createdAt);
    const labelParts = [ts];
    if (change.aiSummary) labelParts.push('AI ✓');
    else labelParts.push('AI ✗');
    if (change.diffType) labelParts.push(`• ${change.diffType}`);
    return {
      label: labelParts.join(' '),
      value: String(change.id),
    };
  });

  items.push({ label: 'Back', value: '__back__' });

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Recent changes: ${selectedMonitor.name}`} />
      {changes.length === 0 ? (
        <Box marginBottom={1}><Text dimColor>No recorded changes yet.</Text></Box>
      ) : (
        <Box marginBottom={1}><Text dimColor>{changes.length} change{changes.length === 1 ? '' : 's'} shown (latest first)</Text></Box>
      )}
      <SelectMenu
        items={items}
        showDivider={false}
        onSelect={(item: { value: string }) => {
          if (item.value === '__back__') {
            goBack();
            return;
          }
          const change = changes.find((c) => String(c.id) === item.value);
          if (change) {
            setSelectedChange(change);
            navigateTo('change-detail');
          }
        }}
      />
    </Box>
  );
}
