import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useNavigation } from '../../context/navigation';
import { useDB } from '../../context/db';
import type { Monitor } from '../../types';
import { Header } from '../../ui/Header';

export function AddMonitor() {
  const { formStep, setFormStep, currentInput, setCurrentInput, resetTo, setSelectedMonitor, setReturnAfterLinkTo, setFlash } = useNavigation();
  const db = useDB();
  const [formData, setFormData] = React.useState({ name: '', url: '', type: 'webpage', intervalMinutes: 60 });
  const isHttpUrl = (value: string): boolean => {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const prompts = [
    'Enter monitor name:',
    'Enter URL to monitor:',
    'Enter type (webpage/api/markdown/xml):',
    'Enter check interval in minutes:',
  ];

  const hints = [
    'e.g., "My blog", "GitHub API", etc.',
    'e.g., https://example.com',
    'webpage = HTML pages, api = JSON endpoints, markdown = Markdown files, xml = XML feeds/documents',
    'e.g., 5, 60, 120 (default: 60)',
  ];

  const handleSubmit = (value: string) => {
    if (!value.trim()) return;
    switch (formStep) {
      case 0:
        setFormData({ ...formData, name: value });
        setCurrentInput('');
        setFormStep(1);
        break;
      case 1:
        if (!isHttpUrl(value.trim())) {
          setFlash('Invalid URL. Use http:// or https://');
          setCurrentInput('');
          break;
        }
        setFormData({ ...formData, url: value.trim() });
        setCurrentInput('');
        setFormStep(2);
        break;
      case 2: {
        const valid = ['webpage', 'api', 'markdown', 'xml'];
        const lower = value.toLowerCase();
        if (!valid.includes(lower)) {
          setFlash('Invalid type. Use one of: webpage, api, markdown, xml');
          setCurrentInput('');
          break;
        }
        setFormData({ ...formData, type: lower });
        setCurrentInput('');
        setFormStep(3);
        break;
      }
      case 3: {
        const interval = parseInt(value) || 60;
        try {
          const created: Monitor = db.createMonitor({
            name: formData.name,
            url: formData.url,
            type: formData.type as 'webpage'|'api'|'markdown'|'xml',
            intervalMinutes: interval,
            active: true,
          });
          setSelectedMonitor(created);
          // After linking during onboarding, return to monitors list
          setReturnAfterLinkTo('list');
          // Reset stack so we don't land back on Add step 1 after linking
          resetTo('link-channel');
          setFormStep(0);
          setCurrentInput('');
        } catch (e: unknown) {
          const err = e as Error;
          console.error('Error creating monitor:', err.message);
          resetTo('main');
          setFormStep(0);
          setCurrentInput('');
        }
        break;
      }
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={`Add monitor (step ${formStep + 1} of 4)`} />
      <Box marginBottom={1}>
        <Text>{prompts[formStep]}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>{hints[formStep]}</Text>
      </Box>
      <Box>
        <Text color="green">&gt; </Text>
        <TextInput value={currentInput} onChange={setCurrentInput} onSubmit={handleSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press ESC to cancel</Text>
      </Box>
    </Box>
  );
}
