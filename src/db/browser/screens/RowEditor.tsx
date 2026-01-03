import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { SelectMenu } from '../../../tui/controls/SelectMenu';
import { SelectItem } from '../../../tui/ui/SelectItem';
import { Header } from '../../../tui/ui/Header';
import { useDB } from '../../../tui/context/db';
import { useDBNavigation } from '../context';

type Mode = 'menu' | 'edit-field';

export function RowEditor() {
  const db = useDB();
  const { selectedTable, selectedRow, goBack, setFlash } = useDBNavigation();
  const [mode, setMode] = React.useState<Mode>('menu');
  const [editingField, setEditingField] = React.useState<string>('');
  const [fieldValue, setFieldValue] = React.useState('');
  const [editedValues, setEditedValues] = React.useState<Record<string, any>>({});

  if (!selectedTable || !selectedRow) return null;

  // Get table info
  const tableInfo = db.getRawDB().query(`PRAGMA table_info(${selectedTable})`).all() as any[];
  const columns = tableInfo.map((col: any) => ({ name: col.name, type: col.type, pk: col.pk > 0 }));
  const primaryKeys = columns.filter(col => col.pk).map(col => col.name);
  
  // Fields that should not be edited
  const protectedFields = [...primaryKeys, 'created_at', 'updated_at'];
  
  // Long text fields that are read-only (too complex to edit in terminal)
  const longTextFields = ['content_md', 'diff_md', 'ai_summary', 'summary'];
  const readOnlyFields = [...protectedFields, ...longTextFields];
  
  const editableColumns = columns.filter(col => !readOnlyFields.includes(col.name));

  const currentValues = { ...selectedRow, ...editedValues };

  function formatValue(val: any, colName: string): string {
    if (val === null || val === undefined) return '(null)';
    const str = String(val);
    // For long text fields, show truncated preview (read-only)
    if (longTextFields.includes(colName) && str.length > 80) {
      const firstLine = str.split('\n')[0];
      return firstLine.slice(0, 60) + `... (${str.length} chars, read-only)`;
    }
    // For other long fields, show truncated preview
    if (str.length > 100) {
      const firstLine = str.split('\n')[0];
      return firstLine.slice(0, 80) + `... (${str.length} chars)`;
    }
    if (str.length > 60) return str.slice(0, 57) + '...';
    return str;
  }

  function saveChanges() {
    if (Object.keys(editedValues).length === 0) {
      goBack();
      return;
    }

    try {
      const setClauses = Object.keys(editedValues).map(col => `${col} = ?`).join(', ');
      const setValues = Object.keys(editedValues).map(col => editedValues[col]);
      
      const whereClauses = primaryKeys.map(pk => `${pk} = ?`).join(' AND ');
      const whereValues = primaryKeys.map(pk => selectedRow[pk]);
      
      const sql = `UPDATE ${selectedTable} SET ${setClauses} WHERE ${whereClauses}`;
      db.getRawDB().query(sql).run(...setValues, ...whereValues);
      
      setFlash('Row updated ✓');
      goBack();
    } catch (e: any) {
      setFlash(`Error: ${e.message}`);
      goBack();
    }
  }

  if (mode === 'edit-field') {
    const col = columns.find(c => c.name === editingField);
    return (
      <Box flexDirection="column" padding={1}>
        <Header title={`Edit: ${editingField}`} />
        <Box marginBottom={1}>
          <Text dimColor>Type: {col?.type} · Current: {formatValue(selectedRow[editingField], editingField)}</Text>
        </Box>
        <Box>
          <TextInput
            value={fieldValue}
            onChange={setFieldValue}
            onSubmit={(val) => {
              setEditedValues({ ...editedValues, [editingField]: val });
              setMode('menu');
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to save, ESC to cancel</Text>
        </Box>
      </Box>
    );
  }

  // Separate read-only items to show at top
  const readOnlyItems = columns
    .filter(col => readOnlyFields.includes(col.name))
    .map(col => ({
      label: `${col.name}: ${formatValue(currentValues[col.name], col.name)} [read-only]`,
      value: `_readonly_${col.name}`,
    }));

  // Build menu items
  const items = [
    ...readOnlyItems,
    ...editableColumns.map(col => {
      const value = currentValues[col.name];
      const isEdited = editedValues.hasOwnProperty(col.name);
      const label = `${col.name}: ${formatValue(value, col.name)}${isEdited ? ' *' : ''}`;
      return { label, value: col.name };
    }),
    { label: 'Save changes', value: '_save' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Edit row in ${selectedTable}`} />
      <Box marginBottom={1}>
        <Text dimColor>
          Read-only: {readOnlyFields.join(', ')}
        </Text>
      </Box>
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        showDivider={false}
        hint="↑↓ select, Enter edit field, ESC cancel"
        onSelect={(item: { value: string }) => {
          if (item.value === '_save') {
            saveChanges();
          } else if (item.value.startsWith('_readonly_')) {
            // Do nothing - read-only field
            return;
          } else {
            setEditingField(item.value);
            setFieldValue(String(currentValues[item.value] || ''));
            setMode('edit-field');
          }
        }}
      />
    </Box>
  );
}
