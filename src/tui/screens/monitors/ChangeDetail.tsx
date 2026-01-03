import React from 'react';
import { Box, Text } from 'ink';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { Header } from '../../ui/Header';
import { SelectMenu } from '../../controls/SelectMenu';
import { SummaryService } from '../../../lib/summary-service';
import { AISDKSummarizer } from '../../../lib/summarizer-aisdk';
import { DroidSummarizer } from '../../../lib/summarizer-droid';
import { NotificationService } from '../../../lib/notifier';
import { resolvePlugin } from '../../../lib/plugins/registry';

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return 'unknown time';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export function ChangeDetail() {
  const { selectedMonitor, selectedChange, setSelectedChange, goBack, setFlash, navigateTo } = useNavigation();
  const db = useDB();
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    return () => {
      setBusy(false);
    };
  }, []);

  if (!selectedMonitor || !selectedChange) {
    goBack();
    return null;
  }

  const events = db.listNotificationEventsForChange(selectedChange.id);
  const recentEvents = events.slice(0, 3);
  const remainingEvents = Math.max(0, events.length - recentEvents.length);

  const aiSummaryLines = React.useMemo(() => {
    const summary = selectedChange.aiSummary ?? '';
    if (summary.trim().length === 0) return [] as string[];
    const raw = summary.split('\n');
    const preview: string[] = raw.slice(0, 3);
    if (raw.length > 3) {
      preview.push('…');
    }
    return preview;
  }, [selectedChange.aiSummary]);

  const sendNotificationsForChange = React.useCallback(async (change: typeof selectedChange): Promise<string> => {
    if (!selectedMonitor) throw new Error('No monitor selected');
    const monitor = selectedMonitor;
    const channels = db.getMonitorChannels(monitor.id, true);
    if (channels.length === 0) {
      return 'No active channels to notify';
    }

    const { plugin, options: pluginOptions } = resolvePlugin(monitor, db);
    if (plugin?.shouldNotify && !plugin.shouldNotify(change, monitor, pluginOptions)) {
      return 'Notification suppressed by plugin';
    }

    const displayUrl = plugin?.linkForPrompt?.({ monitor, options: pluginOptions });
    const notificationService = new NotificationService(db);
    const results = await notificationService.sendNotifications(change, monitor, channels, displayUrl, { allowRepeat: true });
    if (results.length === 0) {
      return 'No channels accepted notifications';
    }
    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    if (failed > 0) {
      const firstError = results.find((r) => !r.ok && r.error)?.error;
      return `Notifications sent to ${sent}/${results.length} channel(s); ${failed} failed${firstError ? ` (${firstError})` : ''}`;
    }
    return `Notifications sent ✓ (${sent}/${results.length})`;
  }, [db, selectedMonitor]);

  async function regenerate(options: { resend: boolean }) {
    if (busy) return;
    setBusy(true);
    try {
      if (!selectedMonitor || !selectedChange) {
        throw new Error('No change selected');
      }
      const monitor = selectedMonitor;
      const change = selectedChange;
      const summaryService = new SummaryService(db, {
        droid: new DroidSummarizer(),
        aisdk: new AISDKSummarizer(),
      });
      const diffSource = change.diffMd ?? '';
      const summaryResult = await summaryService.generateSummary(monitor, diffSource);
      let summaryText = summaryResult?.text ?? null;
      const summaryMeta = summaryResult?.structured ? JSON.stringify(summaryResult.structured) : null;
      if (summaryResult?.structured?.status === 'no_changes') {
        summaryText = null;
      }
      const updated = db.updateChangeAISummary(change.id, summaryText, summaryMeta);
      if (!updated) throw new Error('Failed to update AI summary in database');
      setSelectedChange(updated);

      if (options.resend) {
        const outcome = await sendNotificationsForChange(updated);
        setFlash(`AI summary updated ✓ · ${outcome}`);
      } else {
        let msg: string;
        if (summaryResult?.structured?.status === 'no_changes') {
          msg = 'AI summary updated ✓ (no changes)';
        } else {
          msg = summaryText ? 'AI summary updated ✓' : 'AI summary cleared';
        }
        setFlash(msg);
      }
    } catch (error) {
      const msg = (error as Error)?.message || String(error);
      setFlash(`Failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function resendExisting() {
    if (busy) return;
    if (!selectedChange) return;
    setBusy(true);
    try {
      const outcome = await sendNotificationsForChange(selectedChange);
      setFlash(outcome);
    } catch (error) {
      const msg = (error as Error)?.message || String(error);
      setFlash(`Failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Change details (${formatTimestamp(selectedChange.createdAt)})`} />
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text bold>Diff type:</Text> {selectedChange.diffType ?? 'unknown'}
        </Text>
        <Text>
          <Text bold>Summary:</Text> {selectedChange.summary ?? 'n/a'}
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>AI summary</Text>
        {aiSummaryLines.length === 0 ? (
          <Text>No AI summary stored.</Text>
        ) : (
          aiSummaryLines.map((line, idx) => (
            <Text key={idx}>{line.length > 0 ? line : ' '}</Text>
          ))
        )}
      </Box>
      {events.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Notification history</Text>
          {recentEvents.map((ev) => (
            <Text key={`${ev.id}`}>
              • {formatTimestamp(ev.createdAt)} — {ev.status.toUpperCase()}{ev.detail ? ` (${ev.detail})` : ''}
            </Text>
          ))}
          {remainingEvents > 0 ? (
            <Text dimColor>…and {remainingEvents} more</Text>
          ) : null}
        </Box>
      )}
      <SelectMenu
        items={[
          { label: busy ? 'Resend notifications (busy…) ' : 'Resend notifications', value: 'resend-existing' },
          { label: 'Resend to selected channels', value: 'resend-select' },
          { label: busy ? 'Regenerate AI summary (busy…) ' : 'Regenerate AI summary', value: 'regenerate' },
          { label: busy ? 'Regenerate & re-send (busy…)' : 'Regenerate & re-send notifications', value: 'resend' },
          { label: 'Back', value: 'back' },
        ]}
        showDivider={false}
        onSelect={(item: { value: string }) => {
          if (busy) return;
          switch (item.value) {
            case 'resend-existing':
              resendExisting();
              break;
            case 'resend-select':
              navigateTo('resend-change-channels');
              break;
            case 'regenerate':
              regenerate({ resend: false });
              break;
            case 'resend':
              regenerate({ resend: true });
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
