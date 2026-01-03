import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { SelectMenu } from '../../controls/SelectMenu';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { NotificationService } from '../../../lib/notifier';
import { Header, InfoRow } from '../../ui/Header';
import { resolveNotificationChannelPlugin } from '../../../lib/channel';

export function ChannelDetail() {
  const { selectedChannel, setSelectedChannel, navigateTo, setFormStep, setCurrentInput, setFlash } = useNavigation();
  const db = useDB();
  const [testNotificationStatus, setTestNotificationStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  if (!selectedChannel) return null;
  const plugin = resolveNotificationChannelPlugin(selectedChannel.type);

  const testLabel = testNotificationStatus === 'success' ? 'Sent ✓' :
                    testNotificationStatus === 'failed' ? 'Failed ✗' :
                    'Send test notification';

  const items = [
    { label: 'Edit channel', value: 'edit' },
    { label: testLabel, value: 'test' },
    { label: selectedChannel.active ? 'Disable channel' : 'Enable channel', value: 'toggle' },
    { label: 'Delete channel', value: 'delete' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Channel details: ${selectedChannel.name}`} />
      <Box flexDirection="column">
        <InfoRow label="Type">{plugin?.label ?? selectedChannel.type}</InfoRow>
        <InfoRow label="Status">{selectedChannel.active ? (
            <Text color="green">Active ✓</Text>
          ) : (
            <Text color="red">Inactive ✗</Text>
          )}
        </InfoRow>
      </Box>
      <SelectMenu
        items={items}
        onSelect={async (item: { value: string | number }) => {
          switch (item.value) {
            case 'edit': {
              setFormStep(0);
              setCurrentInput(selectedChannel.name);
              navigateTo('edit-channel');
              break;
            }
            case 'test': {
              const testChannelConfig = db.getNotificationChannelDecrypted(selectedChannel.id) as any;
              if (!testChannelConfig) {
                // Silent in UI to avoid breaking frames; could use setFlash if desired
                return;
              }
              const notifier = new NotificationService(db, {
                logger: {
                  error: (msg) => setFlash(msg),
                },
              });
              const testChange = {
                id: Number.NaN,
                monitorId: Number.NaN,
                releaseVersion: null,
                beforeSnapshotId: null,
                afterSnapshotId: Number.NaN,
                summary: `ping! testing the ${testChannelConfig.name} ${plugin?.label ?? selectedChannel.type} notification channel`,
                diffMd: '',
                diffType: 'addition' as const,
                createdAt: new Date().toISOString(),
                aiSummary: null,
                aiSummaryMeta: null,
              };
              try {
                const results = await notifier.sendNotifications(testChange, {
                id: Number.NaN,
                name: 'Test Monitor',
                url: 'https://example.com',
                intervalMinutes: 60,
                  type: 'webpage' as const,
                  selector: null,
                  includeLink: true,
                  active: true,
                  createdAt: new Date().toISOString(),
                  lastCheckedAt: new Date().toISOString(),
                }, [testChannelConfig]);
                const result = results[0];
                if (result?.ok) {
                  setTestNotificationStatus('success');
                  setFlash('✓ Test notification sent');
                } else {
                  setTestNotificationStatus('failed');
                  setFlash(result?.error || 'Failed to send test notification');
                }
                setTimeout(() => setTestNotificationStatus('idle'), 3000);
              } catch (e) {
                setTestNotificationStatus('failed');
                const err = e as Error;
                setFlash(err?.message || 'Failed to send test notification');
                setTimeout(() => setTestNotificationStatus('idle'), 3000);
              }
              break;
            }
            case 'toggle': {
              const next = selectedChannel.active ? false : true;
              db.updateNotificationChannel(selectedChannel.id, { active: next });
              setSelectedChannel({ ...selectedChannel, active: next });
              break;
            }
            case 'delete': {
              navigateTo('confirm-delete-channel');
              break;
            }
          }
        }}
      />
    </Box>
  );
}
