import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import { Header } from '../../ui/Header';
import { notificationChannelPlugins, resolveNotificationChannelPlugin } from '../../../lib/channel';
import { SelectMenu } from '../../controls/SelectMenu';
import { SelectItem } from '../../ui/SelectItem';

type Mode = 'select-type' | 'form';

export function AddChannel() {
  const { formStep, setFormStep, currentInput, setCurrentInput, setScreen } = useNavigation();
  const db = useDB();
  const plugins = React.useMemo(() => notificationChannelPlugins(), []);
  const initialType = plugins[0]?.id ?? '';
  const [mode, setMode] = React.useState<Mode>(() => (plugins.length > 1 ? 'select-type' : 'form'));
  const [channelFormData, setChannelFormData] = React.useState<{ name: string; type: string; config: Record<string, unknown> }>({ name: '', type: initialType, config: {} });

  React.useEffect(() => {
    if (!initialType && plugins.length === 1) {
      setChannelFormData({ name: '', type: plugins[0].id, config: {} });
      setMode('form');
    }
  }, [initialType, plugins]);

  const plugin = resolveNotificationChannelPlugin(channelFormData.type) ?? (plugins.length === 1 ? plugins[0] : undefined);
  const steps = plugin?.form ?? [];
  const currentStep = steps[formStep];

  if (mode === 'select-type') {
    const items = plugins.map((p) => ({ label: p.label, value: p.id }));
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Select channel type" />
        <SelectMenu
          items={items}
          itemComponent={SelectItem}
          onSelect={(item: { value: string }) => {
            setChannelFormData({ name: '', type: item.value, config: {} });
            setFormStep(0);
            setCurrentInput('');
            setMode('form');
          }}
        />
      </Box>
    );
  }

  if (!plugin) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Add notification channel" />
        <Text dimColor>No channel plugins are available.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Add notification channel – ${plugin.label} (step ${Math.min(formStep + 1, steps.length)} of ${steps.length})`} />
      {currentStep ? (
        <>
          <Box marginBottom={1}>
            <Text>{currentStep.prompt}</Text>
          </Box>
          {currentStep.hint ? (
            <Box marginBottom={1}>
              <Text dimColor>{currentStep.hint}</Text>
            </Box>
          ) : null}
        </>
      ) : null}
      <Box>
        <Text color="green">&gt; </Text>
        <TextInput
          value={currentInput}
          onChange={setCurrentInput}
          onSubmit={(value) => {
            if (!value.trim() && formStep > 0) return;
            if (!currentStep) return;

            setChannelFormData((prev) => {
              if (currentStep.field === 'name') {
                return { ...prev, name: value };
              }
              return { ...prev, config: { ...prev.config, [currentStep.field]: value } };
            });

            const isLastStep = formStep >= steps.length - 1;
            if (isLastStep) {
              const config =
                currentStep.field === 'name'
                  ? channelFormData.config
                  : { ...channelFormData.config, [currentStep.field]: value };
              const name = currentStep.field === 'name' ? value : channelFormData.name;
              try {
                db.createNotificationChannel({
                  name,
                  type: plugin.id,
                  config,
                  active: true,
                });
              } catch (e: unknown) {
                const err = e as Error;
                console.error('Error creating channel:', err.message);
              }
              setScreen('channels');
              setFormStep(0);
              setCurrentInput('');
              setChannelFormData({ name: '', type: plugin.id, config: {} });
              if (plugins.length > 1) {
                setMode('select-type');
              }
            } else {
              setCurrentInput('');
              setFormStep(formStep + 1);
            }
          }}
          mask={currentStep?.mask ? '*' : undefined}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press ESC to cancel</Text>
      </Box>
      {plugins.length > 1 ? (
        <Box marginTop={1}>
          <Text dimColor>Need a different channel type? ESC → Add channel to pick again.</Text>
        </Box>
      ) : null}
    </Box>
  );
}
