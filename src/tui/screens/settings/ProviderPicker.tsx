import React from 'react';
import { Box, Text } from 'ink';
import { useDB } from '../../context/db';
import { useNavigation } from '../../context/navigation';
import { Header } from '../../ui/Header';
import { SelectMenu } from '../../controls/SelectMenu';
import { SelectItem } from '../../ui/SelectItem';

type ProviderId = 'droid'|'anthropic'|'openai'|'google';

const PROVIDERS: ProviderId[] = ['droid','anthropic','openai','google'];

export function ProviderPicker() {
  const db = useDB();
  const { goBack } = useNavigation();
  const current = ((db.getSetting('ai_provider') || 'droid') as ProviderId);

  function displayName(p: ProviderId): string {
    try { const rec = db.getAIProvider(p); if (rec?.name) return rec.name; } catch {}
    if (p==='openai') return 'OpenAI';
    if (p==='anthropic') return 'Anthropic';
    if (p==='google') return 'Google';
    return 'Droid';
  }

  const items = PROVIDERS.map((p) => ({ label: `${displayName(p)}${p===current?'  ✓':''}`, value: p }));

  // default model helper imported above

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Pick provider" />
      <SelectMenu
        items={items}
        itemComponent={({ label }: { label: string; isSelected?: boolean }) => {
          const hasCheck = /\s✓$/.test(label);
          const base = label.replace(/\s✓$/, '');
          return (
            <Text>
              {base}{hasCheck ? <Text> </Text> : null}{hasCheck ? <Text color="green">✓</Text> : null}
            </Text>
          );
        }}
        showDivider={false}
        onSelect={(item: { value: string }) => {
          const p = item.value as ProviderId;
          db.setSetting('ai_provider', p);
          // Reset model to provider default
          const remembered = db.getSetting(`ai_model_${p}`);
          const defaultModel = remembered || pickDefaultModel(db, p);
          db.setSetting('ai_model', defaultModel);
          db.setSetting(`ai_model_${p}`, defaultModel);
          // If provider requires key and it's absent, disable AI summaries
          if (p !== 'droid') {
            const pk = db.getAIProviderDecrypted(p);
            if (!pk?.apiKey) {
              db.setSetting('ai_summaries_enabled','false');
            }
          }
          goBack();
        }}
      />
    </Box>
  );
}
import { defaultModelForProvider as pickDefaultModel } from '../../../lib/ai/config';
