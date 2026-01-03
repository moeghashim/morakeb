import React from 'react';
import {Box, Text, useStdout} from 'ink';
import TextInput from 'ink-text-input';
import {Header} from '../../tui/ui/Header';
import {HelpBar} from '../../tui/ui/HelpBar';
import type {SecretCard} from './types';

type HostScreenProps = {
  host: string;
  notice: string | null;
  onSubmit: (value: string) => void;
  onChange: (value: string) => void;
};

export function HostScreen({host, notice, onSubmit, onChange}: HostScreenProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Header title="GitHub Auto-Deploy" />
      <Box marginTop={1}>
        <Text>Enter the SSH host alias configured in ~/.ssh/config (e.g., changes):</Text>
      </Box>
      <TextInput key="auto-deploy-host-input" value={host} onChange={onChange} onSubmit={onSubmit} />
      {notice ? (
        <Box marginTop={1}>
          <Text color="yellow">{notice}</Text>
        </Box>
      ) : null}
      <HelpBar text={'Enter to submit, Esc to go back'} />
    </Box>
  );
}

type DestScreenProps = {
  dest: string;
  onSubmit: (value: string) => void;
  onChange: (value: string) => void;
};

export function DestinationScreen({dest, onSubmit, onChange}: DestScreenProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Deployment Path" />
      <Box marginTop={1}>
        <Text>Enter destination path on VPS (default /opt/changes):</Text>
      </Box>
      <TextInput key="auto-deploy-dest-input" value={dest} onChange={onChange} onSubmit={onSubmit} />
      <HelpBar text={'Enter to submit, Esc to go back'} />
    </Box>
  );
}

type GenerateScreenProps = {
  status: 'idle' | 'generating' | 'success' | 'failed';
  spinner: string;
  error: string;
};

export function GenerateScreen({status, spinner, error}: GenerateScreenProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Setting up Auto-Deploy" />
      {status === 'generating' && <Text>{spinner} Generating deploy key and workflow...</Text>}
      {status === 'failed' && (
        <>
          <Text color="red">✗ Setup failed</Text>
          {error && <Text color="red">{error}</Text>}
          <Box marginTop={1}>
            <Text dimColor>Press ESC to go back</Text>
          </Box>
        </>
      )}
    </Box>
  );
}

type SecretScreenProps = {
  cards: SecretCard[];
  notice: string | null;
  noticeColor: 'green' | 'yellow' | 'red';
  copyHint: string;
};

export function SecretsScreen({cards, notice, noticeColor, copyHint}: SecretScreenProps) {
  const {stdout} = useStdout();
  const columns = stdout?.columns ?? 80;
  const cardWidth = Math.max(20, columns - 4); // account for outer padding/borders
  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Add GitHub Secrets" />

      <Box flexDirection="column" marginBottom={1}>
        <Text>1. Open your GitHub repository settings</Text>
        <Text>2. Secrets and variables → Actions</Text>
        <Text>3. Add each secret below using the values provided</Text>
      </Box>

      {cards.map((card) => (
        <Box
          key={card.id}
          flexDirection="column"
          borderStyle="single"
          paddingX={1}
          paddingY={0}
          marginBottom={1}
          width={cardWidth}
        >
          <Text>
            <Text bold>Secret:</Text> <Text color="cyan">{card.name}</Text>
          </Text>
          <Text>
            <Text bold>Value:</Text>{' '}
            <Text dimColor>{card.value}</Text>
          </Text>
          <Text dimColor>{card.helperName}</Text>
          <Text color={card.highlightValue ? 'green' : undefined} dimColor={!card.highlightValue}>
            {card.helperValue}
          </Text>
        </Box>
      ))}

      {notice && (
        <Box marginBottom={1}>
          <Text color={noticeColor}>{notice}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="yellow">⚠ Keep this key secure! Don't share it publicly.</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{copyHint.includes('Press') ? 'Press Enter when you\'ve added the secrets to GitHub' : copyHint}</Text>
      </Box>
    </Box>
  );
}

export function DoneScreen() {
  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Auto-Deploy Ready!" />

      <Box flexDirection="column" marginBottom={1}>
        <Text color="green">✓ Created .github/workflows/deploy.yml</Text>
        <Text color="green">✓ Deploy key configured on VPS</Text>
        <Text color="green">✓ SSH config ready for GitHub Actions</Text>
      </Box>

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text bold>Next steps:</Text>
        <Text>1. Commit the workflow: git add .github && git commit -m "Add auto-deploy"</Text>
        <Text>2. Push to main: git push</Text>
        <Text>3. Check Actions tab on GitHub to see deployment</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Every push to main will now automatically deploy to your VPS!</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Enter to finish</Text>
      </Box>
    </Box>
  );
}
