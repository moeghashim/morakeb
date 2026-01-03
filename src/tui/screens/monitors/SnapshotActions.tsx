import React from 'react';
import { Box, Text } from 'ink';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { Header } from '../../ui/Header';
import { SelectMenu } from '../../controls/SelectMenu';
import { SummaryService } from '../../../lib/summary-service';
import { DroidSummarizer } from '../../../lib/summarizer-droid';
import { AISDKSummarizer } from '../../../lib/summarizer-aisdk';
import { NotificationService } from '../../../lib/notifier';
import { extractVersion } from '../../../lib/version';
import { resolvePlugin } from '../../../lib/plugins/registry';

export function SnapshotActions() {
  const { selectedMonitor, selectedSnapshot, setSelectedChange, setFlash, goBack, navigateTo } = useNavigation();
  const db = useDB();
  const [busy, setBusy] = React.useState(false);

  if (!selectedMonitor || !selectedSnapshot) {
    goBack();
    return null;
  }

  const monitor = selectedMonitor!;
  const snapId = selectedSnapshot!.id;
  const snapshotCreatedAt = selectedSnapshot!.createdAt;

  async function createTestChange(sendNow: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const snapshot = db.getSnapshot(snapId)!;
      const summaryService = new SummaryService(db, { droid: new DroidSummarizer(), aisdk: new AISDKSummarizer() });
      const summaryResult = await summaryService.generateSummary(monitor, snapshot.contentMd);
      const structured = summaryResult?.structured ?? null;
      const versionToken = extractVersion(snapshot.releaseVersion || snapshot.contentMd) || '';
      const heading = `**${monitor.name}${versionToken ? ` ${versionToken}` : ''} released**`;
      const summaryLines = (summaryResult?.text || '').split('\n');
      const stripped = summaryLines.slice(1).join('\n').trim();
      const aiSummary = structured?.status === 'no_changes' ? heading : [heading, stripped].filter(Boolean).join('\n');
      const aiSummaryMeta = structured ? JSON.stringify(structured) : null;

      const change = db.createChange({
        monitorId: monitor.id,
        beforeSnapshotId: null,
        afterSnapshotId: snapshot.id,
        summary: `Test notification from snapshot ${snapshot.id}`,
        aiSummary: aiSummary ?? null,
        aiSummaryMeta,
        diffMd: snapshot.contentMd,
        diffType: 'addition',
        releaseVersion: snapshot.releaseVersion ?? null,
      });

      setSelectedChange(change);

      if (sendNow) {
        const channels = db.getMonitorChannels(monitor.id, true);
        if (channels.length === 0) {
          setFlash('No active channels to notify');
        } else {
          const { plugin, options } = resolvePlugin(monitor, db);
          const displayUrl = plugin?.linkForPrompt?.({ monitor, options });
          const svc = new NotificationService(db);
          const results = await svc.sendNotifications(change, monitor, channels, displayUrl, { allowRepeat: true });
          const sent = results.filter((r) => r.ok).length;
          const failed = results.length - sent;
          setFlash(failed > 0 ? `Sent ${sent}/${results.length}; ${failed} failed` : `Notifications sent ✓ (${sent}/${results.length})`);
        }
      } else {
        setFlash('Test change created ✓');
      }
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      setFlash(`Failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function createTestChangeAndPickChannels() {
    // Reuse existing creation flow without sending, then navigate to channel picker
    await createTestChange(false);
    navigateTo('resend-change-channels');
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Snapshot actions (${new Date(snapshotCreatedAt).toLocaleString()})`} />
      {selectedSnapshot.releaseVersion ? (
        <Box marginBottom={1}><Text dimColor>Release version: {selectedSnapshot.releaseVersion}</Text></Box>
      ) : null}
      <SelectMenu
        items={[
          { label: busy ? 'Create & send notifications (busy…)' : 'Create test change and send notifications', value: 'create-send' },
          { label: busy ? 'Create test change (busy…)' : 'Create test change only', value: 'create-only' },
          { label: busy ? 'Create & pick channels (busy…)': 'Create test change and pick channels', value: 'create-select' },
          { label: 'Back', value: 'back' },
        ]}
        showDivider={false}
        onSelect={(item: { value: string }) => {
          if (busy) return;
          switch (item.value) {
            case 'create-send':
              createTestChange(true);
              break;
            case 'create-only':
              createTestChange(false);
              break;
            case 'create-select':
              void createTestChangeAndPickChannels();
              break;
            case 'back':
              goBack();
              break;
          }
        }}
      />
    </Box>
  );
}
