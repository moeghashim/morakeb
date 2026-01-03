import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { Header } from '../../ui/Header';
import { SelectMenu } from '../../controls/SelectMenu';
import { SelectItem } from '../../ui/SelectItem';
import { resolveNotificationChannelPlugin } from '../../../lib/channel';

type Mode = 'menu' | 'edit-name' | 'edit-field';

export function EditChannel() {
  const { selectedChannel, setSelectedChannel, goBack, setBackHandler, setFlash } = useNavigation();
  const db = useDB();
  const [mode, setMode] = React.useState<Mode>('menu');
  const [fieldKey, setFieldKey] = React.useState<string>('');
  const [input, setInput] = React.useState('');
  if (!selectedChannel) return null;

  const decrypted = db.getNotificationChannelDecrypted((selectedChannel as any).id) as { config?: Record<string, unknown> } | undefined;
  const cfg = (decrypted?.config || {}) as Record<string, unknown>;
  const plugin = resolveNotificationChannelPlugin(selectedChannel.type);

  function star(s: unknown) {
    return s ? '********' : '';
  }

  function update(patch: { name?: string; config?: Record<string, unknown> }) {
    db.updateNotificationChannel((selectedChannel as any).id, patch);
    const updated = db.getNotificationChannel((selectedChannel as any).id);
    if (updated) setSelectedChannel(updated);
  }

  React.useEffect(() => {
    const handler = () => {
      if (mode !== 'menu') { setMode('menu'); setInput(''); return true; }
      return false;
    };
    setBackHandler(handler);
    return () => setBackHandler(null);
  }, [mode, setBackHandler]);

  if (mode === 'edit-name') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Edit channel name" />
        <Box><TextInput value={input} onChange={setInput} onSubmit={(v) => { update({ name: v }); setFlash('Name updated ✓'); setMode('menu'); }} /></Box>
        <Box marginTop={1}><Text dimColor>ESC to cancel</Text></Box>
      </Box>
    );
  }

  if (mode === 'edit-field') {
    const step = plugin?.form.find((f) => f.field === fieldKey);
    const title = `Edit ${(step?.prompt || fieldKey).replace(/:$/, '')}`;
    return (
      <Box flexDirection="column" padding={1}>
        <Header title={title} />
        <Box><TextInput value={input} mask={step?.mask ? '*' : undefined} onChange={setInput} onSubmit={(v) => { update({ config: { ...cfg, [fieldKey]: v } }); setFlash('Updated ✓'); setMode('menu'); }} /></Box>
        <Box marginTop={1}><Text dimColor>ESC to cancel</Text></Box>
      </Box>
    );
  }

  // Menu
  const items: Array<{ label: string; value: string }> = [];
  items.push({ label: `Name: ${selectedChannel.name}` , value: 'name' });
  const configFields = plugin?.form.filter((f) => f.field !== 'name') ?? [];
  for (const field of configFields) {
    const raw = cfg[field.field];
    const display = field.mask ? star(raw) : String(raw ?? '');
    const label = `${(field.prompt || field.field).replace(/:$/, '')}: ${display}`;
    items.push({ label, value: field.field });
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Edit channel: ${selectedChannel.name}`} />
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        showDivider={false}
        onSelect={(item: { value: string }) => {
          if (item.value === 'name') { setInput(selectedChannel.name); setMode('edit-name'); return; }
          setFieldKey(item.value);
          const step = plugin?.form.find((f) => f.field === item.value);
          const isSecret = step?.mask === true;
          setInput(isSecret ? '' : String(cfg[item.value] ?? ''));
          setMode('edit-field');
        }}
      />
    </Box>
  );
}
