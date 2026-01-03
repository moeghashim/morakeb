import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../controls/SelectMenu';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import type { Monitor } from '../../types';


export function MonitorsList() {
  const { navigateTo, setSelectedMonitor } = useNavigation();
  const db = useDB();
  const monitors = db.listMonitors();

  React.useEffect(() => {}, []);
  const items = monitors.map((m: Monitor) => ({
    label: `${m.name} — ${m.active ? 'Active' : 'Inactive'}`,
    value: String(m.id),
    _meta: { interval: m.intervalMinutes, active: m.active },
  }));

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Monitors ({monitors.length})</Text>
      </Box>
      {monitors.length === 0 ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>No monitors yet. Add one from the main menu!</Text>
          </Box>
          <Box>
            <Text dimColor>Press ESC, q, to go back</Text>
          </Box>
        </Box>
      ) : (
        <SelectMenu
          items={items}
          showDivider={false}
          onSelect={(item: { value: string }) => {
          const monitor = monitors.find(m => String(m.id) === item.value);
            if (monitor) {
              setSelectedMonitor(monitor);
              navigateTo('monitor-detail');
            }
          }}
          itemComponent={({ label }: { label: string }) => {
            const parts = label.split(' — ');
            const name = parts[0];
            const status = parts[1] || '';
            const isActive = status.toLowerCase().includes('active');
            const m = monitors.find(mm => `${mm.name} — ${mm.active ? 'Active' : 'Inactive'}` === label);
            const every = m ? m.intervalMinutes : undefined;
            const everyText = every !== undefined ? (every === 1 ? 'every 1 minute' : `every ${every} minutes`) : '';
            return (
              <Text>
                <Text color={isActive ? 'green' : 'red'}>{name} - {isActive ? 'Active' : 'Inactive'}</Text>
                {every !== undefined ? <Text> </Text> : null}
                {every !== undefined ? <Text dimColor>{everyText}</Text> : null}
              </Text>
            );
          }}
        />
      )}
    </Box>
  );
}
