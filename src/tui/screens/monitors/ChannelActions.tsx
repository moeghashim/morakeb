import React from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../controls/SelectMenu';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { Header } from '../../ui/Header';
import { SelectItem } from '../../ui/SelectItem';
import { resolveNotificationChannelPlugin } from '../../../lib/channel';
import { NotificationService } from '../../../lib/notifier';

export function MonitorChannelActions() {
  const { selectedMonitor, selectedChannel, navigateTo, goBack } = useNavigation();
  const db = useDB();
  if (!selectedMonitor || !selectedChannel) return null;

  // Read current link options fresh
  const linked = db.getMonitorChannels(selectedMonitor.id) as any[];
  const link = linked.find((c) => String(c.id) === String(selectedChannel.id)) as (typeof selectedChannel & { includeLink?: boolean|null; deliveryMode?: 'immediate' | 'weekly_digest'; lastDigestAt?: string | null }) | undefined;
  const [includeLink, setIncludeLink] = React.useState<'inherit'|'yes'|'no'>(() => {
    const v = link?.includeLink;
    return v === null || v === undefined ? 'inherit' : (v ? 'yes' : 'no');
  });
  const [deliveryMode, setDeliveryMode] = React.useState<'immediate' | 'weekly_digest'>(() => (link?.deliveryMode === 'weekly_digest' ? 'weekly_digest' : 'immediate'));
  const plugin = resolveNotificationChannelPlugin(selectedChannel.type);
  const lastDigestLabel = React.useMemo(() => {
    if (!link?.lastDigestAt) return '—';
    const d = new Date(link.lastDigestAt);
    if (Number.isNaN(d.getTime())) return link.lastDigestAt;
    return d.toLocaleString();
  }, [link?.lastDigestAt]);

  const items = [
    { label: `Include link: ${includeLink}`, value: 'toggle-link' },
    { label: `Delivery: ${deliveryMode === 'weekly_digest' ? 'weekly digest' : 'immediate'}`, value: 'toggle-delivery' },
    { label: 'Send test notification', value: 'test' },
    { label: 'Open channel details', value: 'open' },
    { label: 'Unlink from this monitor', value: 'unlink' },
    { label: 'Back', value: 'back' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Channel settings" />
      <Box>
        <Text dimColor>Monitor: {selectedMonitor.name}</Text>
      </Box>
      <Box>
        <Text>
          <Text bold>{selectedChannel.name}</Text> [{plugin?.label ?? selectedChannel.type}]
        </Text>
      </Box>
      {deliveryMode === 'weekly_digest' ? (
        <Box>
          <Text dimColor>Weekly digest (last sent: {lastDigestLabel})</Text>
        </Box>
      ) : null}
      <SelectMenu
        items={items}
        itemComponent={SelectItem}
        onSelect={(item: { value: string }) => {
          if (item.value === 'toggle-link') {
            const next = includeLink === 'inherit' ? 'yes' : includeLink === 'yes' ? 'no' : 'inherit';
            setIncludeLink(next);
            const eff: boolean | null = next === 'inherit' ? null : next === 'yes' ? true : false;
            db.updateMonitorChannelOptions(selectedMonitor.id, selectedChannel.id as any, { includeLink: eff });
            return;
          }
          if (item.value === 'toggle-delivery') {
            const next = deliveryMode === 'immediate' ? 'weekly_digest' : 'immediate';
            setDeliveryMode(next);
            db.updateMonitorChannelOptions(selectedMonitor.id, selectedChannel.id as any, { deliveryMode: next });
            return;
          }
          if (item.value === 'test') {
            const linkedChannel = db.getMonitorChannels(selectedMonitor.id, true).find((c) => c.id === selectedChannel.id);
            if (!linkedChannel) return;
            const notificationService = new NotificationService(db);
            const testChange = {
              id: Number.NaN,
              monitorId: Number.NaN,
              releaseVersion: null,
              beforeSnapshotId: null,
              afterSnapshotId: Number.NaN,
              summary: `ping! testing the ${selectedChannel.name} channel`,
              diffMd: '',
              diffType: 'addition' as const,
              createdAt: new Date().toISOString(),
              aiSummary: null,
              aiSummaryMeta: null,
            };
            void notificationService.sendNotifications(testChange as any, { ...selectedMonitor, includeLink: true } as any, [linkedChannel]);
            return;
          }
          if (item.value === 'open') { navigateTo('channel-detail'); return; }
          if (item.value === 'unlink') { navigateTo('confirm-unlink-monitor-channel'); return; }
          if (item.value === 'back') { goBack(); return; }
        }}
      />
    </Box>
  );
}
