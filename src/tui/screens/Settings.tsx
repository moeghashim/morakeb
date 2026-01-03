import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../controls/SelectMenu';
import { useNavigation } from '../context/navigation';
import { useDB } from '../context/db';
import { SelectItem } from '../ui/SelectItem';
import { Header } from '../ui/Header';

export function SettingsScreen() {
  const { navigateTo } = useNavigation();
  const db = useDB();
  const [aiEnabled, setAiEnabled] = React.useState(
    () => (db.getSetting('ai_summaries_enabled') || '').toLowerCase() === 'true'
  );
  const [aiStatus, setAiStatus] = React.useState<'on' | 'off' | 'enabling' | 'disabling'>(
    () => (aiEnabled ? 'on' : 'off')
  );
  const statusTimer = React.useRef<NodeJS.Timeout | null>(null);
  const provider = (db.getSetting('ai_provider') || 'droid').toLowerCase();
  const providerRec = (() => { try { return db.getAIProviderDecrypted(provider); } catch { return undefined; } })();
  const providerName = ((): string => {
    if (providerRec?.name) return providerRec.name;
    if (provider==='anthropic') return 'Anthropic';
    if (provider==='openai') return 'OpenAI';
    if (provider==='google') return 'Google';
    return 'Droid';
  })();
  function defaultModelForProvider(p: string): string {
    try {
      const models = db.listAIModels(p).filter((m) => m.active);
      const def = models.find((m) => m.isDefault);
      return (def ?? models[0])?.id || '';
    } catch {
      if (p==='droid') return 'claude-haiku-4-5-20251001';
      if (p==='anthropic') return 'claude-haiku-4-5';
      if (p==='openai') return 'gpt-5-mini-2025-08-07';
      if (p==='google') return 'gemini-2.5-flash-lite';
      return '';
    }
  }
  const rawModel = db.getSetting('ai_model') || '';
  const effectiveModel = rawModel || defaultModelForProvider(provider);
  const modelDisplay = effectiveModel.includes(':') ? effectiveModel.split(':',2)[1] : effectiveModel;

  // Persist default model if none set, to keep settings consistent
  React.useEffect(() => {
    if (!rawModel && modelDisplay) {
      db.setSetting('ai_model', modelDisplay);
      db.setSetting(`ai_model_${provider}`, modelDisplay);
    }
  }, [provider]);
  const model = db.getSetting('ai_model') || '';

  const providerVerified = provider === 'droid' ? true : !!providerRec?.verified;
  const canEnable = aiStatus === 'off' && providerVerified;

  const items = [
    ...(canEnable
      ? [{ label: 'Enable AI summaries', value: 'enable-ai' } as const]
      : aiStatus === 'on'
        ? [{ label: 'Disable AI summaries', value: 'disable-ai' } as const]
        : []),
    { label: 'Edit AI', value: 'edit-ai' },
    { label: 'Notifications', value: 'notifications' },
    { label: 'Retention', value: 'retention' },
    { label: 'Plugins', value: 'plugins' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Settings" />
      <Box flexDirection="column">
        <Text>
          <Text bold>AI summaries</Text> - {(() => {
            if (aiStatus === 'enabling') return <Text color="yellow">Enabling...</Text>;
            if (aiStatus === 'disabling') return <Text color="yellow">Disabling...</Text>;
            return aiEnabled ? <Text color="green">On</Text> : <Text color="red">Off</Text>;
          })()}
        </Text>
        <Text>
          <Text bold>Provider</Text> - {providerName}
          {(() => {
            if (provider === 'droid') return null;
            const pr = providerRec;
            const saved = !!pr?.apiKey;
            const verified = !!pr?.verified;
            const text = saved ? (verified ? 'Key verified ✓' : 'Key saved • verify') : 'Key missing ✗';
            const color = saved ? (verified ? 'green' : undefined) : 'red';
            return (<Text> [<Text color={color}>{text}</Text>]</Text>);
          })()}
        </Text>
        <Text>
          <Text bold>Model</Text> - {modelDisplay}
        </Text>
      </Box>
      {/* Divider sits directly under info */}
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        onSelect={(item: { value: string }) => {
          if (item.value === 'enable-ai') {
            if (statusTimer.current) clearTimeout(statusTimer.current);
            setAiStatus('enabling');
            db.setSetting('ai_summaries_enabled','true');
            setAiEnabled(true);
            statusTimer.current = setTimeout(() => setAiStatus('on'), 600);
            return;
          }
          if (item.value === 'disable-ai') {
            if (statusTimer.current) clearTimeout(statusTimer.current);
            setAiStatus('disabling');
            db.setSetting('ai_summaries_enabled','false');
            setAiEnabled(false);
            statusTimer.current = setTimeout(() => setAiStatus('off'), 600);
            return;
          }
          if (item.value === 'edit-ai') { navigateTo('edit-ai'); return; }
          if (item.value === 'notifications') { navigateTo('notifications-settings'); return; }
          if (item.value === 'retention') { navigateTo('retention-settings'); return; }
          if (item.value === 'plugins') { navigateTo('plugin-settings'); return; }
        }}
      />
    </Box>
  );
}
