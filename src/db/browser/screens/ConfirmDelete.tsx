import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../../tui/controls/SelectMenu';
import { SelectItem } from '../../../tui/ui/SelectItem';
import { Header } from '../../../tui/ui/Header';
import { useDB } from '../../../tui/context/db';
import { useDBNavigation } from '../context';

// Whitelist of valid table names to prevent SQL injection
const VALID_TABLE_NAMES = new Set([
  'monitors',
  'snapshots',
  'changes',
  'notification_channels',
  'monitor_notification_channels',
  'channel_digest_items',
  'notification_events',
  'settings',
  'ai_providers',
  'ai_models',
  'job_locks',
  'job_events',
]);

function validateTableName(tableName: string | null | undefined): string | null {
  if (!tableName || !VALID_TABLE_NAMES.has(tableName)) {
    return null;
  }
  return tableName;
}

export function ConfirmDelete() {
  const db = useDB();
  const { selectedTable, selectedRow, goBack, setFlash } = useDBNavigation();

  const safeTableName = validateTableName(selectedTable);
  if (!safeTableName || !selectedRow) return null;

  // Get primary keys - use parameterized query for table name via whitelist validation
  const tableInfo = db.getRawDB().query(`PRAGMA table_info(${safeTableName})`).all() as any[];
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
      
      const sql = `DELETE FROM ${safeTableName} WHERE ${whereClauses}`;
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
        <Text>Delete row from <Text bold>{safeTableName}</Text>?</Text>
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
