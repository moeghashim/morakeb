import React from 'react';
import { Box, Text } from 'ink';
import { useDB } from '../../context/db';
import { useNavigation } from '../../context/navigation';
import { Header } from '../../ui/Header';
import { SelectMenu } from '../../controls/SelectMenu';
import { SelectItem } from '../../ui/SelectItem';

export function ModelPicker() {
  const db = useDB();
  const { goBack } = useNavigation();
  const strategy = (db.getSetting('ai_provider') || 'droid').toLowerCase();
  const current = db.getSetting('ai_model') || '';

  const fromDb = db.listAIModels(strategy as any).filter(m => m.active).map(m => m.id);
  const items = fromDb.map(m => ({ label: m + (m===current?'  ✓':''), value: m }));

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Pick model" />
      <SelectMenu
        items={items}
        itemComponent={({ label }: { label: string; isSelected?: boolean }) => {
          const hasCheck = /\s✓$/.test(label);
          const base = hasCheck ? label.replace(/\s✓$/, '') : label;
          return (
            <Text>
              {base}
              {hasCheck ? <Text> </Text> : null}
              {hasCheck ? <Text color="green">✓</Text> : null}
            </Text>
          );
        }}
        showDivider={false}
        onSelect={(item: { value: string }) => {
          db.setSetting('ai_model', item.value);
          db.setSetting(`ai_model_${strategy}`, item.value);
          goBack();
        }}
      />
    </Box>
  );
}
