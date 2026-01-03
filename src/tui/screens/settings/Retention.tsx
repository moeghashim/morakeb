import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useDB } from '../../context/db';
import { useNavigation } from '../../context/navigation';
import { Header } from '../../ui/Header';
import { SelectMenu } from '../../controls/SelectMenu';
import { SelectItem } from '../../ui/SelectItem';

type Mode = 'menu' | 'edit-snapshots' | 'edit-changes';

function parseLimit(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function RetentionSettings() {
  const db = useDB();
  const { goBack, setFlash } = useNavigation();
  const [mode, setMode] = React.useState<Mode>('menu');
  const [input, setInput] = React.useState('');

  const snapshotsLimit = parseLimit(db.getSetting('retention_snapshots'), 20);
  const changesLimit = parseLimit(db.getSetting('retention_changes'), 20);

  if (mode === 'edit-snapshots') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Snapshot retention" />
        <Text>Keep the last N snapshots per monitor.</Text>
        <Box marginTop={1}>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={(v) => {
              const n = parseLimit(v, 0);
              if (!Number.isFinite(n) || n <= 0) {
                setFlash('Enter a number greater than 0');
                return;
              }
              db.setSetting('retention_snapshots', String(n));
              setFlash('Snapshot retention updated');
              setMode('menu');
              setInput('');
            }}
          />
        </Box>
        <Box marginTop={1}><Text dimColor>ESC to cancel</Text></Box>
      </Box>
    );
  }

  if (mode === 'edit-changes') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Change retention" />
        <Text>Keep the last N changes per monitor.</Text>
        <Box marginTop={1}>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={(v) => {
              const n = parseLimit(v, 0);
              if (!Number.isFinite(n) || n <= 0) {
                setFlash('Enter a number greater than 0');
                return;
              }
              db.setSetting('retention_changes', String(n));
              setFlash('Change retention updated');
              setMode('menu');
              setInput('');
            }}
          />
        </Box>
        <Box marginTop={1}><Text dimColor>ESC to cancel</Text></Box>
      </Box>
    );
  }

  const items = [
    { label: `Snapshots: keep ${snapshotsLimit}`, value: 'snapshots' },
    { label: `Changes: keep ${changesLimit}`, value: 'changes' },
    { label: 'Reset to defaults', value: 'reset' },
    { label: 'Back', value: 'back' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Retention" />
      <Text>Defaults are 20 snapshots and 20 changes per monitor.</Text>
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        onSelect={(item: { value: string }) => {
          if (item.value === 'snapshots') {
            setInput(String(snapshotsLimit));
            setMode('edit-snapshots');
            return;
          }
          if (item.value === 'changes') {
            setInput(String(changesLimit));
            setMode('edit-changes');
            return;
          }
          if (item.value === 'reset') {
            db.deleteSetting('retention_snapshots');
            db.deleteSetting('retention_changes');
            setFlash('Retention reset to defaults');
            return;
          }
          if (item.value === 'back') {
            goBack();
          }
        }}
      />
    </Box>
  );
}
