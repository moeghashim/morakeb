import React, {useEffect, useState} from 'react';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {ensureDir} from './sys';
import {parseSSHConfigForHost, generateDeployKey, createWorkflowContent, type SSHConfig} from './github-actions';
import {spinnerFrames, nextSpinnerFrame} from './shared';
import {
  HostScreen,
  DestinationScreen,
  GenerateScreen,
  SecretsScreen,
  DoneScreen,
} from './auto-deploy/screens';
import type {
  AutoDeployPhase,
  AutoDeployStatus,
  SecretCard,
} from './auto-deploy/types';
import {AUTO_DEPLOY_MASK_LENGTH} from './auto-deploy/types';
import {useSecretBindings} from './auto-deploy/secret-bindings';

type PhaseSetter = (phase: AutoDeployPhase) => void;

const autoDeployMaskLength = AUTO_DEPLOY_MASK_LENGTH;

export type AutoDeployHandlers = {
  render(): React.ReactNode | null;
  handleInput(input: string, key: {return?: boolean}): boolean;
  handleBack(): boolean;
  reset(): void;
  isAutoPhase: boolean;
  spinnerFrame: string;
};

export function useAutoDeployFlow(params: {
  phase: AutoDeployPhase | string;
  setPhase: PhaseSetter | ((phase: string) => void);
  scpHost: string;
  setScpHost: (value: string) => void;
  scpDest: string;
  setScpDest: (value: string) => void;
  persistHostDest: (host: string, dest: string) => Promise<void>;
  appDir: string;
}): AutoDeployHandlers {
  const {phase, setPhase, scpHost, setScpHost, scpDest, setScpDest, persistHostDest, appDir} = params;
  const [autoDeployStatus, setAutoDeployStatus] = useState<AutoDeployStatus>('idle');
  const [autoDeployError, setAutoDeployError] = useState<string>('');
  const [autoDeployPrivateKey, setAutoDeployPrivateKey] = useState<string>('');
  const [autoDeployConfig, setAutoDeployConfig] = useState<SSHConfig | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const secretBindingState = useSecretBindings({
    autoDeployPrivateKey,
    autoDeployConfig,
    setNotice,
  });
  const {secretBindingPairs, secretBindingMap, copyHint, resetCopyHint, copySecret} = secretBindingState;
  const [spinner, setSpinner] = useState(0);

  const isAutoPhase =
    phase === 'auto-deploy-host' ||
    phase === 'auto-deploy-dest' ||
    phase === 'auto-deploy-generate' ||
    phase === 'auto-deploy-show-key' ||
    phase === 'auto-deploy-done';

  useEffect(() => {
    if (phase !== 'auto-deploy-show-key') {
      resetCopyHint();
      if (phase !== 'auto-deploy-generate') {
        setAutoDeployConfig(null);
      }
      return;
    }
    resetCopyHint();
    setNotice(null);
  }, [phase, resetCopyHint]);

  useEffect(() => {
    if (phase !== 'auto-deploy-generate') return;
    let cancelled = false;

    setNotice(null);
    setAutoDeployError('');
    setAutoDeployStatus('generating');
    setAutoDeployPrivateKey('');
    setAutoDeployConfig(null);

    const setup = async () => {
      try {
        const sshConfig = await parseSSHConfigForHost(scpHost);
        if (!sshConfig) {
          throw new Error(`Could not parse SSH config for host "${scpHost}". Make sure it exists in ~/.ssh/config`);
        }

        const privateKey = await generateDeployKey(scpHost);
        if (cancelled) return;
        setAutoDeployPrivateKey(privateKey);
        setAutoDeployConfig(sshConfig);

        const workflowContent = createWorkflowContent(sshConfig, scpDest);
        const workflowDir = path.join(appDir, '.github', 'workflows');
        const targetPath = path.join(workflowDir, 'deploy.yml');

        await ensureDir(workflowDir);
        await fs.writeFile(targetPath, workflowContent, 'utf-8');

        if (cancelled) return;
        setAutoDeployStatus('success');
        setPhase('auto-deploy-show-key');
      } catch (err) {
        if (cancelled) return;
        setAutoDeployConfig(null);
        setAutoDeployStatus('failed');
        setAutoDeployError(err instanceof Error ? err.message : 'Setup failed');
      }
    };

    void setup();
    return () => {
      cancelled = true;
    };
  }, [phase, scpHost, scpDest, appDir, setPhase]);

  useEffect(() => {
    if (phase !== 'auto-deploy-generate') return;
    const timer = setInterval(() => setSpinner((s) => nextSpinnerFrame(s)), 100);
    return () => clearInterval(timer);
  }, [phase]);

  const handleInput = (input: string, key: {return?: boolean}): boolean => {
    if (!isAutoPhase) return false;
    if (phase === 'auto-deploy-show-key') {
      const binding = secretBindingMap.get(input);
      if (binding) {
        copySecret(binding);
        return true;
      }
      if (key.return) {
        setPhase('auto-deploy-done');
        return true;
      }
    }
    return false;
  };

  const handleBack = (): boolean => {
    if (!isAutoPhase) return false;
    switch (phase) {
      case 'auto-deploy-host':
        reset();
        setPhase('mode' as any);
        return true;
      case 'auto-deploy-dest':
        setNotice(null);
        setPhase('auto-deploy-host');
        return true;
      case 'auto-deploy-generate':
        setAutoDeployStatus('idle');
        setAutoDeployError('');
        reset();
        setPhase('auto-deploy-dest');
        return true;
      case 'auto-deploy-show-key':
        resetCopyHint();
        setPhase('auto-deploy-dest');
        return true;
      case 'auto-deploy-done':
        setPhase('mode' as any);
        return true;
      default:
        return false;
    }
  };

  const render = (): React.ReactNode | null => {
    if (!isAutoPhase) return null;
    const maskedKey = (autoDeployPrivateKey
      ? '*'.repeat(Math.min(autoDeployPrivateKey.length, autoDeployMaskLength))
      : ''
    ).padEnd(autoDeployMaskLength, '*');

    const noticeColor: 'green' | 'yellow' | 'red' = notice
      ? notice.startsWith('✓')
        ? 'green'
        : notice.startsWith('✗')
          ? 'red'
          : 'yellow'
      : 'yellow';

    switch (phase) {
      case 'auto-deploy-host':
        return (
          <HostScreen
            host={scpHost}
            notice={notice}
            onChange={setScpHost}
            onSubmit={(value) => {
              const trimmed = value.trim();
              if (!trimmed) {
                setNotice('Host alias is required');
                return;
              }
              setNotice(null);
              setScpHost(trimmed);
              setPhase('auto-deploy-dest');
            }}
          />
        );
      case 'auto-deploy-dest':
        return (
          <DestinationScreen
            dest={scpDest}
            onChange={setScpDest}
            onSubmit={async (value) => {
              const trimmed = value.trim() || '/opt/changes';
              setNotice(null);
              setScpDest(trimmed);
              try {
                await persistHostDest(scpHost, trimmed);
              } catch {
                // ignore persistence errors
              }
              setPhase('auto-deploy-generate');
            }}
          />
        );
      case 'auto-deploy-generate':
        return (
          <GenerateScreen status={autoDeployStatus} spinner={spinnerFrames[spinner]} error={autoDeployError} />
        );
      case 'auto-deploy-show-key':
        {
          const cards: SecretCard[] = secretBindingPairs.map(({descriptor, nameShortcut, valueShortcut}) => {
            const isKey = descriptor.id === 'key';
            const value = descriptor.masked
              ? maskedKey
              : descriptor.value || (descriptor.optional ? 'Optional – leave unset for port 22' : '(not detected)');
            const helperValue = isKey ? copyHint : `Press ${valueShortcut} to copy value`;
            const helperName = `Press ${nameShortcut} to copy name`;
            return {
              id: descriptor.id,
              name: descriptor.name,
              value,
              optional: descriptor.optional,
              helperName,
              helperValue,
              highlightValue: isKey && helperValue.startsWith('Copied'),
            };
          });
          return (
            <SecretsScreen
              cards={cards}
              notice={notice}
              noticeColor={noticeColor}
              copyHint={copyHint}
            />
          );
        }
      case 'auto-deploy-done':
        return <DoneScreen />;
      default:
        return null;
    }
  };

  const reset = () => {
    setNotice(null);
    resetCopyHint();
  };

  return {
    render,
    handleInput,
    handleBack,
    reset,
    isAutoPhase,
    spinnerFrame: spinnerFrames[spinner],
  };
}
