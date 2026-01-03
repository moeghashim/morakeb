import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../../tui/controls/SelectMenu';
import { SelectItem } from '../../../tui/ui/SelectItem';
import { Header } from '../../../tui/ui/Header';
import { useDB } from '../../../tui/context/db';
import { useDBNavigation } from '../context';

export function ConfirmDelete() {
  const db = useDB();
  const { selectedTable, selectedRow, goBack, setFlash } = useDBNavigation();

  if (!selectedTable || !selectedRow) return null;

  // Get primary keys
  const tableInfo = db.getRawDB().query(`PRAGMA table_info(${selectedTable})`).all() as any[];
  const primaryKeys = tableInfo.filter((col: any) => col.pk > 0).map((col: any) => col.name);

  const pkDisplay = primaryKeys.map(pk => `${pk}=${selectedRow[pk]}`).join(', ');

  const items = [
    { label: 'Yes, delete', value: 'yes' },
    { label: 'Cancel', value: 'no' },
  ];

  function deleteRow() {
    try {
      const whereClauses = primaryKeys.map(pk => `${pk} = ?`).join(' AND ');
      const whereValues = primaryKeys.map(pk => selectedRow[pk]);
      
      const sql = `DELETE FROM ${selectedTable} WHERE ${whereClauses}`;
      db.getRawDB().query(sql).run(...whereValues);
      
      setFlash('Row deleted ✓');
      goBack();
      goBack(); // Go back twice to return to table viewer
    } catch (e: any) {
      setFlash(`Error: ${e.message}`);
      goBack();
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Confirm Delete" />
      <Box marginBottom={1} flexDirection="column">
        <Text>Delete row from <Text bold>{selectedTable}</Text>?</Text>
        <Text dimColor>Primary key: {pkDisplay}</Text>
      </Box>
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        showDivider={false}
        hint="↑↓ select, Enter confirm, ESC cancel"
        onSelect={(item: { value: string }) => {
          if (item.value === 'yes') {
            deleteRow();
          } else {
            goBack();
          }
        }}
      />
    </Box>
  );
}
