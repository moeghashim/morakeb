import React from 'react';
import type { Screen } from './types';
import { useNavigation } from './context/navigation';
import { FlashBar } from './ui/FlashBar';

import { MainMenu } from './screens/MainMenu';
import { SettingsScreen } from './screens/Settings';
import { MonitorsList } from './screens/monitors/List';
import { MonitorDetail } from './screens/monitors/Detail';
import { AddMonitor } from './screens/monitors/Add';
import { EditMonitor } from './screens/monitors/Edit';
import { LinkedChannels } from './screens/monitors/LinkedChannels';
import { LinkChannel } from './screens/monitors/LinkChannel';
import { AddChannelsToMonitor } from './screens/monitors/AddChannelsToMonitor';
import { ConfirmDeleteMonitor } from './screens/monitors/ConfirmDelete';
import { ConfirmUnlinkMonitorChannel } from './screens/monitors/ConfirmUnlinkChannel';
import { MonitorChannelActions } from './screens/monitors/ChannelActions';
import { MonitorChanges } from './screens/monitors/Changes';
import { ChangeDetail } from './screens/monitors/ChangeDetail';
import { MonitorSnapshots } from './screens/monitors/Snapshots';
import { SnapshotActions } from './screens/monitors/SnapshotActions';
import { ResendChangeChannels } from './screens/monitors/ResendChangeChannels';
import { ChannelsList } from './screens/channels/List';
import { ChannelDetail } from './screens/channels/Detail';
import { AddChannel } from './screens/channels/Add';
import { EditChannel } from './screens/channels/Edit';
import { ConfirmDeleteChannel } from './screens/channels/ConfirmDelete';
import { EditAI } from './screens/settings/EditAI';
import { NotificationsSettings } from './screens/settings/Notifications';
import { RetentionSettings } from './screens/settings/Retention';
import { PluginsSettings } from './screens/settings/Plugins';
import { ModelPicker } from './screens/settings/ModelPicker';
import { EditProviderKey } from './screens/settings/EditProviderKey';
import { ProviderPicker } from './screens/settings/ProviderPicker';

export function ScreenRouter() {
  const { screen } = useNavigation();
  
  const render = (s: Screen) => {
    switch (s) {
      case 'main': return <MainMenu />;
      case 'settings': return <SettingsScreen />;
      case 'list': return <MonitorsList />;
      case 'monitor-detail': return <MonitorDetail />;
      case 'add': return <AddMonitor />;
      case 'edit-monitor': return <EditMonitor />;
      case 'view-linked-channels': return <LinkedChannels />;
      case 'link-channel': return <LinkChannel />;
      case 'add-channels-to-monitor': return <AddChannelsToMonitor />;
      case 'confirm-delete-monitor': return <ConfirmDeleteMonitor />;
      case 'confirm-unlink-monitor-channel': return <ConfirmUnlinkMonitorChannel />;
      case 'monitor-channel-actions': return <MonitorChannelActions />;
      case 'monitor-changes': return <MonitorChanges />;
      case 'monitor-snapshots': return <MonitorSnapshots />;
      case 'snapshot-actions': return <SnapshotActions />;
      case 'change-detail': return <ChangeDetail />;
      case 'resend-change-channels': return <ResendChangeChannels />;
      case 'channels': return <ChannelsList />;
      case 'channel-detail': return <ChannelDetail />;
      case 'add-channel': return <AddChannel />;
      case 'edit-channel': return <EditChannel />;
      case 'confirm-delete-channel': return <ConfirmDeleteChannel />;
      case 'edit-ai': return <EditAI />;
      case 'notifications-settings': return <NotificationsSettings />;
      case 'retention-settings': return <RetentionSettings />;
      case 'plugin-settings': return <PluginsSettings />;
      case 'pick-model': return <ModelPicker />;
      case 'edit-provider-key': return <EditProviderKey />;
      case 'pick-provider': return <ProviderPicker />;
      default: return null;
    }
  };
  return (
    <>
      {render(screen)}
      <FlashBar align="center" />
    </>
  );
}
