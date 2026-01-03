import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useDB } from '../../context/db';
import { useNavigation } from '../../context/navigation';
import { Header } from '../../ui/Header';
import { SelectMenu } from '../../controls/SelectMenu';
import { SelectItem } from '../../ui/SelectItem';
import { spawnSync } from 'node:child_process';
import { defaultModelForProvider as pickDefaultModel } from '../../../lib/ai/config';
import { verifyProviderWithAISDK } from '../../../lib/ai/verify-aisdk';
import { warmupDroidModel } from '../../../lib/ai/droid';

export function EditAI() {
  const db = useDB();
  const { goBack, navigateTo } = useNavigation();

  const [provider, setProvider] = React.useState<'droid'|'anthropic'|'openai'|'google'>(() => {
    const p = (db.getSetting('ai_provider')||'').toLowerCase();
    if (p==='droid'||p==='anthropic'||p==='openai'||p==='google') return p as any;
    const legacy = (db.getSetting('ai_strategy')||'').toLowerCase();
    if (legacy==='droid') return 'droid';
    if (legacy==='direct' || legacy==='aisdk') return 'anthropic';
    return 'droid';
  });
  const [model, setModel] = React.useState<string>(() => db.getSetting('ai_model') || '');
  const [enabled, setEnabled] = React.useState<boolean>(() => (db.getSetting('ai_summaries_enabled')||'').toLowerCase()==='true');
  const [busy, setBusy] = React.useState(false);
  const [lastError, setLastError] = React.useState<string | null>(null);

  const droidDefaults = ['claude-haiku-4-5-20251001','claude-sonnet-4-5-20250929','gpt-5-2025-08-07','glm-4.6'] as const;
  // Direct provider model defaults come from DB; droid has a local list for quick copy/test.

  function providerDisplayName(p: 'droid'|'anthropic'|'openai'|'google'): string {
    try {
      const rec = db.getAIProvider(p);
      if (rec?.name) return rec.name;
    } catch {}
    if (p==='openai') return 'OpenAI';
    if (p==='anthropic') return 'Anthropic';
    if (p==='google') return 'Google';
    return 'Droid';
  }

  const keyStatus = (() => {
    if (provider === 'droid') return 'n/a';
    try {
      const saved = !!db.getAIProviderDecrypted(provider)?.apiKey;
      const verified = !!db.getAIProvider(provider)?.verified;
      return saved ? (verified ? 'verified ✓' : 'saved • verify') : 'missing ✗';
    } catch { return 'missing ✗'; }
  })();

  // Auto-disable if provider requires key and it's missing
  React.useEffect(() => {
    if (provider !== 'droid') {
      const hasKey = !!db.getAIProviderDecrypted(provider)?.apiKey;
      if (!hasKey && enabled) {
        db.setSetting('ai_summaries_enabled','false');
        setEnabled(false);
        setLastError('Provider key missing — AI summaries disabled ✗');
        setTimeout(() => setLastError(null), 3000);
      }
    }
  }, [provider]);

  useInput((input, key) => {
    if (key.escape) { goBack(); }
    if (input.toLowerCase() === 'c' && provider === 'droid') {
      const selected = (droidDefaults as readonly string[]).includes(model) ? model : droidDefaults[0];
      const cmd = `droid exec -m ${selected} -o text -r off "Reply with exactly: pong"`;
      try {
        if (process.platform === 'darwin') {
          spawnSync('pbcopy', [], { input: cmd, encoding: 'utf8' });
        }
        // Always print for visibility
        console.log(`Copied/printed droid command:\n${cmd}`);
      } catch {
        console.log(`Command:\n${cmd}`);
      }
    }
  });

  async function liveTestAISDK(): Promise<boolean> {
    const modelId = model || pickDefaultModel(db, provider);
    const v = await verifyProviderWithAISDK(db, provider as any, modelId);
    if (!v.ok) { setLastError(v.error || 'Verification failed'); return false; }
    return true;
  }

  function testDroid(): boolean {
    const selected = (droidDefaults as readonly string[]).includes(model) ? model : droidDefaults[0];
    const res = warmupDroidModel(selected);
    if (!res.ok) {
      const err = res.stderr.trim() || res.stdout.trim() || (res.status !== null ? `exit ${res.status}` : res.error?.message || 'warm-up failed');
      setLastError(err);
    }
    return res.ok;
  }

  async function enableWithTest() {
    setBusy(true); setLastError(null);
    let ok = false;
    if (provider === 'droid') ok = testDroid();
    else ok = await liveTestAISDK();
    const now = new Date().toISOString();
    db.setSetting(`ai_last_test_status_${provider}`, ok ? 'success' : 'failed');
    db.setSetting(`ai_last_test_at_${provider}`, now);
    db.setAIProviderVerified(provider as any, ok);
    if (ok) { db.setSetting('ai_summaries_enabled','true'); setEnabled(true); setLastError('Test succeeded ✓'); }
    else { db.setSetting('ai_summaries_enabled','false'); setEnabled(false); setLastError('Test failed ✗'); }
    setBusy(false);
    setTimeout(() => setLastError(null), 3000);
  }

  function openModelPicker() { navigateTo('pick-model'); }

  const effectiveModel = model || pickDefaultModel(db, provider);
  const modelDisplay = effectiveModel.includes(':') ? effectiveModel.split(':',2)[1] : effectiveModel;

  // Persist default model if none set for current provider
  React.useEffect(() => {
    if (!model && effectiveModel) {
      db.setSetting('ai_model', effectiveModel);
      db.setSetting(`ai_model_${provider}`, effectiveModel);
      setModel(effectiveModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);
  // last test status
  const lastStatus = (db.getSetting(`ai_last_test_status_${provider}`)||'').toLowerCase();
  const lastLine = lastStatus ? ` (Last: ${lastStatus==='success'?'Success':'Failed'})` : '';
  const providerDisplay = providerDisplayName(provider);
  const hasKey = provider==='droid' ? false : !!db.getAIProviderDecrypted(provider)?.apiKey;

  const items = [
    { label: `AI summaries: ${enabled ? 'On' : 'Off'}` + (busy ? ' (testing...)' : ''), value: 'toggle-enabled' },
    { label: `Provider: ${providerDisplay}` + (provider!=='droid' ? ` [Key ${keyStatus}]` : ''), value: 'pick-provider' },
    { label: `Model: ${modelDisplay}`, value: 'pick-model' },
    ...(provider !== 'droid' ? [{ label: `${hasKey ? 'Change' : 'Set'} API key`, value: 'set-key' } as const] : []),
    { label: `Run provider test${lastLine}`, value: 'test' },
    { label: 'Back', value: 'back' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Edit AI" />
      <SelectMenu
        items={items}
        itemComponent={({ label }: { label: string; isSelected?: boolean }) => {
          // Render bracketed key status with color only for that segment
          if (label.startsWith('Provider:') && label.includes('[') && label.includes(']')) {
            const before = label.slice(0, label.indexOf('[')).trimEnd();
            const inside = label.slice(label.indexOf('[') + 1, label.indexOf(']'));
            const after = label.slice(label.indexOf(']') + 1);
            const ok = /verified ✓/i.test(inside);
            return (
              <Text>
                {before} [<Text color={ok ? 'green' : 'red'}>{inside}</Text>]{after}
              </Text>
            );
          }
          if (label.startsWith('AI summaries:')) {
            const on = /\bOn\b/.test(label);
            const parts = label.split(':');
            const left = parts[0] + ':';
            const right = parts.slice(1).join(':').trimStart();
            return (
              <Text>
                {left} <Text color={on ? 'green' : 'red'}>{right}</Text>
              </Text>
            );
          }
          return <SelectItem label={label} />;
        }}
        showDivider={false}
        onSelect={async (item: { value: string }) => {
          switch (item.value) {
            case 'toggle-enabled': {
              if (enabled) { db.setSetting('ai_summaries_enabled','false'); setEnabled(false); return; }
              await enableWithTest(); return;
            }
            case 'pick-provider': { navigateTo('pick-provider'); return; }
            case 'pick-model': { openModelPicker(); return; }
            case 'set-key': { navigateTo('edit-provider-key'); return; }
            case 'test': {
              setBusy(true); setLastError(null);
              const ok = provider==='droid' ? testDroid() : await liveTestAISDK();
              const now = new Date().toISOString();
              db.setSetting(`ai_last_test_status_${provider}`, ok ? 'success' : 'failed');
              db.setSetting(`ai_last_test_at_${provider}`, now);
              db.setAIProviderVerified(provider as any, ok);
              if (ok) setLastError('Test succeeded ✓');
              if (!ok && enabled) { db.setSetting('ai_summaries_enabled','false'); setEnabled(false); setLastError('Test failed ✗'); }
              setBusy(false); return;
            }
            case 'back': { goBack(); return; }
          }
        }}
      />
      {lastError && (
        /succeeded/i.test(lastError) ? <Text color="green">{lastError}</Text> : <Text color="red">{lastError}</Text>
      )}
      {provider==='droid' && <Text dimColor>Press "c" to copy the droid test command.</Text>}
    </Box>
  );
}
