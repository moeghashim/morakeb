import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../../tui/controls/SelectMenu';
import { SelectItem } from '../../../tui/ui/SelectItem';
import { Header } from '../../../tui/ui/Header';
import { useDB } from '../../../tui/context/db';
import { useDBNavigation } from '../context';

const TABLE_NAMES = [
  'changes',
  'snapshots',
];

export function TableList() {
  const db = useDB();
  const { navigateTo, setSelectedTable, setCurrentPage } = useDBNavigation();

  const items = TABLE_NAMES.map(tableName => {
    let count = 0;
    try {
      const result = db.getRawDB().query(`SELECT COUNT(*) as count FROM ${tableName}`).get();
      count = (result as any)?.count || 0;
    } catch {
      count = 0;
    }
    return {
      label: `${tableName} (${count} rows)`,
      value: tableName,
    };
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Database Tables" />
      <Box marginBottom={1}>
        <Text dimColor>Select a table to browse</Text>
      </Box>
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        showDivider={false}
        hint="↑↓ select, Enter open, q quit"
        onSelect={(item: { value: string }) => {
          setSelectedTable(item.value);
          setCurrentPage(0);
          navigateTo('table-viewer');
        }}
      />
    </Box>
  );
}
