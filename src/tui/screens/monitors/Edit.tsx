import React from 'react';
import { useInput } from 'ink';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { SelectMenu } from '../../controls/SelectMenu';
import { SelectItem } from '../../ui/SelectItem';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { Header } from '../../ui/Header';

type Mode = 'menu' | 'edit-name' | 'edit-url' | 'pick-type' | 'pick-interval' | 'custom-interval';

export function EditMonitor() {
  const { selectedMonitor, setSelectedMonitor, goBack, setFlash, setBackHandler } = useNavigation();
  const db = useDB();
  const [mode, setMode] = React.useState<Mode>('menu');
  const [input, setInput] = React.useState('');
  if (!selectedMonitor) return null;
  const isHttpUrl = (value: string): boolean => {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  // Intercept back globally while on this screen
  React.useEffect(() => {
    const handler = () => {
      if (mode !== 'menu') { setMode('menu'); setInput(''); return true; }
      return false;
    };
    setBackHandler(handler);
    return () => setBackHandler(null);
  }, [mode, setBackHandler]);

  function middleTruncate(str: string, max = 60): string {
    if (str.length <= max) return str;
    const keep = Math.floor((max - 1) / 2);
    return str.slice(0, keep) + '…' + str.slice(-keep);
  }

  function refresh() {
    const updated = db.getMonitor((selectedMonitor as any).id);
    if (updated) setSelectedMonitor(updated);
  }

  function update(patch: Partial<typeof selectedMonitor>) {
    db.updateMonitor((selectedMonitor as any).id, patch as any);
    refresh();
  }

  if (mode === 'edit-name') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Edit name" />
        <Box><TextInput value={input} onChange={setInput} onSubmit={(v) => { update({ name: v }); setFlash('Name updated ✓'); setMode('menu'); }} /></Box>
        <Box marginTop={1}><Text dimColor>ESC to cancel</Text></Box>
      </Box>
    );
  }

  if (mode === 'edit-url') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Edit URL" />
        <Box><TextInput value={input} onChange={setInput} onSubmit={(v) => {
          const next = v.trim();
          if (!isHttpUrl(next)) { setFlash('Invalid URL. Use http:// or https://'); return; }
          update({ url: next });
          setFlash('URL updated ✓');
          setMode('menu');
        }} /></Box>
        <Box marginTop={1}><Text dimColor>ESC to cancel</Text></Box>
      </Box>
    );
  }

  if (mode === 'pick-type') {
    const types = ['webpage','api','markdown','xml'] as const;
    const items = types.map(t => ({ label: t + (t===selectedMonitor.type?'  ✓':''), value: t }));
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Monitor type" />
        <SelectMenu items={items} itemComponent={SelectItem} showDivider={false} onSelect={(it: { value: string }) => { update({ type: it.value as any }); setFlash('Type updated ✓'); setMode('menu'); }} />
      </Box>
    );
  }

  if (mode === 'pick-interval') {
    const presets = [1, 5, 10, 15, 30, 60];
    const items = [
      ...presets.map(n => ({ label: `${n} minute${n===1?'':'s'}`, value: String(n) })),
      { label: 'Custom…', value: 'custom' },
    ];
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Check interval" />
        <SelectMenu items={items} itemComponent={SelectItem} showDivider={false} onSelect={(it: { value: string }) => {
          if (it.value === 'custom') { setInput(String(selectedMonitor.intervalMinutes)); setMode('custom-interval'); return; }
          update({ intervalMinutes: parseInt(it.value) }); setFlash('Interval updated ✓'); setMode('menu');
        }} />
      </Box>
    );
  }

  if (mode === 'custom-interval') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Custom interval (minutes)" />
        <Box><TextInput value={input} onChange={setInput} onSubmit={(v) => { const n = Math.max(1, parseInt(v) || selectedMonitor.intervalMinutes); update({ intervalMinutes: n }); setFlash('Interval updated ✓'); setMode('menu'); }} /></Box>
        <Box marginTop={1}><Text dimColor>ESC to cancel</Text></Box>
      </Box>
    );
  }

  const items = [
    { label: `Name: ${selectedMonitor.name}`, value: 'name' },
    { label: `URL: ${middleTruncate(selectedMonitor.url, 70)}`, value: 'url' },
    { label: `Type: ${selectedMonitor.type}`, value: 'type' },
    { label: `Check interval: ${selectedMonitor.intervalMinutes}m`, value: 'interval' },
    { label: `Include link in summaries: ${selectedMonitor.includeLink ? 'on' : 'off'}`, value: 'toggle-link' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Edit monitor: ${selectedMonitor.name}`} />
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        showDivider={false}
        onSelect={(item: { value: string }) => {
          switch (item.value) {
            case 'name': setInput(selectedMonitor.name); setMode('edit-name'); return;
            case 'url': setInput(selectedMonitor.url); setMode('edit-url'); return;
            case 'type': setMode('pick-type'); return;
            case 'interval': setMode('pick-interval'); return;
            case 'toggle-link': update({ includeLink: !selectedMonitor.includeLink }); setFlash('Updated ✓'); return;
          }
        }}
      />
    </Box>
  );
}
