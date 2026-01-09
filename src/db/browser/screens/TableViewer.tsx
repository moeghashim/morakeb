import React from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';
import { SelectMenu } from '../../../tui/controls/SelectMenu';
import { Header } from '../../../tui/ui/Header';
import { useDB } from '../../../tui/context/db';
import { useDBNavigation } from '../context';

const PAGE_SIZE = 10;

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

export function TableViewer() {
  const db = useDB();
  const { selectedTable, navigateTo, setSelectedRow, currentPage, setCurrentPage, flash, setFlash } = useDBNavigation();

  const safeTableName = validateTableName(selectedTable);
  if (!safeTableName) return null;

  // Get table info - use parameterized query for table name via whitelist validation
  const tableInfo = db.getRawDB().query(`PRAGMA table_info(${safeTableName})`).all() as any[];
  const columns = tableInfo.map((col: any) => col.name);
  const primaryKeys = tableInfo.filter((col: any) => col.pk > 0).map((col: any) => col.name);

  // Get total count
  const countResult = db.getRawDB().query(`SELECT COUNT(*) as count FROM ${safeTableName}`).get() as any;
  const totalRows = countResult?.count || 0;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);

  // Get paginated rows with monitor names for changes/snapshots
  const offset = currentPage * PAGE_SIZE;
  let rows: any[];
  
  if (safeTableName === 'changes' || safeTableName === 'snapshots') {
    // Join with monitors to show monitor name
    rows = db.getRawDB().query(
      `SELECT ${safeTableName}.*, monitors.name as monitor_name 
       FROM ${safeTableName} 
       LEFT JOIN monitors ON ${safeTableName}.monitor_id = monitors.id 
       ORDER BY ${safeTableName}.created_at DESC 
       LIMIT ? OFFSET ?`
    ).all(PAGE_SIZE, offset) as any[];
  } else {
    rows = db.getRawDB().query(`SELECT * FROM ${safeTableName} LIMIT ? OFFSET ?`).all(PAGE_SIZE, offset) as any[];
  }

  // Select important columns to display (not all)
  const getDisplayColumns = (): string[] => {
    if (selectedTable === 'changes') {
      return ['id', 'monitor_name', 'summary', 'ai_summary', 'created_at'];
    } else if (selectedTable === 'snapshots') {
      return ['id', 'monitor_name', 'content_hash', 'created_at'];
    }
    // Default: show first 5 columns
    return columns.slice(0, 5);
  };

  const displayColumns = getDisplayColumns();
  const [selectedIdx, setSelectedIdx] = React.useState(0);

  // Custom keyboard navigation
  useInput((input, key) => {
    if (input === 'n' && currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
      if (flash) setFlash(null);
    } else if (input === 'p' && currentPage > 0) {
      setCurrentPage(currentPage - 1);
      if (flash) setFlash(null);
    } else if (input === 'g') {
      setCurrentPage(0);
      if (flash) setFlash(null);
    } else if (input === 'd' && rows.length > 0) {
      setSelectedRow(rows[selectedIdx]);
      navigateTo('confirm-delete-row');
    }
  });

  // Truncate and make single-line
  const truncateSingleLine = (str: string, maxLen = 60): string => {
    if (!str) return '';
    // Replace newlines with spaces, collapse multiple spaces
    const singleLine = String(str).replace(/\s+/g, ' ').trim();
    if (singleLine.length <= maxLen) return singleLine;
    return singleLine.slice(0, maxLen - 3) + '...';
  };

  // Build meaningful row labels based on table type
  const getRowLabel = (row: any): string => {
    if (safeTableName === 'changes') {
      const summary = row.ai_summary || row.summary || 'no summary';
      return `Change for ${row.monitor_name || 'unknown'} · ${truncateSingleLine(summary, 40)}`;
    } else if (safeTableName === 'snapshots') {
      return `Snapshot for ${row.monitor_name || 'unknown'} · ${row.created_at || ''}`;
    }
    // Default: show first non-id column
    const displayCol = columns.find(c => !c.toLowerCase().includes('id'));
    const val = displayCol ? row[displayCol] : row[columns[0]];
    return String(val || '');
  };

  const items = rows.map((row, idx) => ({
    label: getRowLabel(row),
    value: String(idx),
    _row: row,
  }));

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Table: ${safeTableName}`} />
      <Box marginBottom={1}>
        <Text dimColor>
          {totalRows} rows · page {currentPage + 1}/{totalPages || 1}
        </Text>
      </Box>
      {flash && (
        <Box marginBottom={1}>
          <Text>{flash}</Text>
        </Box>
      )}
      {rows.length === 0 ? (
        <Box flexDirection="column">
          <Text dimColor>No rows in this table</Text>
          <Box marginTop={1}>
            <Text dimColor>Press ESC or q to go back</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>Columns: {displayColumns.join(', ')}</Text>
          </Box>
          <SelectMenu
            items={items}
            showDivider={true}
            hint="↑↓ navigate, Enter edit, d delete, n/p page, ESC back"
            onSelect={(item: any) => {
              const idx = items.findIndex(i => i.value === item.value);
              setSelectedIdx(idx);
              setSelectedRow(item._row);
              navigateTo('row-editor');
            }}
            itemComponent={({ label }: { label: string }) => {
              return <Text>{label}</Text>;
            }}
          />
        </Box>
      )}
    </Box>
  );
}
