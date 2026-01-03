import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useDB } from '../../context/db';
import { useNavigation } from '../../context/navigation';
import { Header } from '../../ui/Header';
import { verifyProviderWithAISDK } from '../../../lib/ai/verify-aisdk';

export function EditProviderKey() {
  const db = useDB();
  const { goBack } = useNavigation();
  const provider = ((db.getSetting('ai_provider')||'anthropic') as 'anthropic'|'openai'|'google'|'droid');
  function providerDisplayName(p: 'anthropic'|'openai'|'google'|'droid'): string {
    try { const rec = db.getAIProvider(p as any); if (rec?.name) return rec.name; } catch {}
    if (p==='openai') return 'OpenAI';
    if (p==='anthropic') return 'Anthropic';
    if (p==='google') return 'Google';
    return 'Droid';
  }
  if (provider === 'droid') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Set provider key" />
        <Text>Current provider is droid; no API key required.</Text>
      </Box>
    );
  }
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');

  async function verifyAndSave(key: string) {
    setBusy(true); setMsg('');
    try {
      key = key.trim();
      const modelId = provider === 'anthropic' ? 'claude-haiku-4-5' : provider === 'openai' ? 'gpt-5-mini-2025-08-07' : 'gemini-2.5-flash-lite';
      db.setAIProviderKey(provider, key);
      const v = await verifyProviderWithAISDK(db, provider as 'anthropic'|'openai'|'google', modelId);
      db.setAIProviderVerified(provider, v.ok);
      if (!v.ok) { setMsg(`Verification failed: ${v.error || 'unknown error'}`); setBusy(false); return; }
      setMsg('Key saved and verified ✓');
      setTimeout(() => goBack(), 800);
    } catch (e: any) {
      db.setAIProviderKey(provider, key);
      db.setAIProviderVerified(provider, false);
      const msg = e?.name === 'AbortError' ? 'Verification timed out' : String(e?.message||e);
      setMsg(`Verification failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Set ${providerDisplayName(provider)} API key`} />
      <Box marginTop={1}><Text dimColor>Paste your API key and press Enter</Text></Box>
      <Box>
        <TextInput value={value} onChange={setValue} mask="*" onSubmit={(v) => verifyAndSave(v)} />
      </Box>
      {busy ? <Text dimColor>Verifying…</Text> : (msg ? <Text>{msg}</Text> : null)}
    </Box>
  );
}
