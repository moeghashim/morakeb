import {useMemo, useRef, useState} from 'react';
import {spawnSync} from 'node:child_process';
import type {SecretDescriptor} from './types';
import {AUTO_DEPLOY_MASK_LENGTH, DEFAULT_COPY_HINT} from './types';

type SecretBinding = {
  shortcut: string;
  descriptor: SecretDescriptor;
  target: 'name' | 'value';
};

type SecretBindingPair = {
  descriptor: SecretDescriptor;
  nameShortcut: string;
  valueShortcut: string;
};

type SecretBindingState = {
  secretDescriptors: SecretDescriptor[];
  secretBindingPairs: SecretBindingPair[];
  secretBindingMap: Map<string, SecretBinding>;
  copyHint: string;
  resetCopyHint: () => void;
  setCopyHint: (hint: string) => void;
  copySecret: (binding: SecretBinding) => void;
};

export function useSecretBindings({
  autoDeployPrivateKey,
  autoDeployConfig,
  setNotice,
}: {
  autoDeployPrivateKey: string;
  autoDeployConfig: {hostname: string; user: string; port?: number} | null;
  setNotice: (notice: string | null) => void;
}): SecretBindingState {
  const [copyHint, setCopyHint] = useState<string>(DEFAULT_COPY_HINT);
  const copyHintTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetCopyHint = () => {
    if (copyHintTimeoutRef.current) {
      clearTimeout(copyHintTimeoutRef.current);
      copyHintTimeoutRef.current = null;
    }
    setCopyHint(DEFAULT_COPY_HINT);
  };

  const secretDescriptors = useMemo<SecretDescriptor[]>(() => {
    const host = autoDeployConfig?.hostname ?? '';
    const userValue = autoDeployConfig?.user ?? 'root';
    const portValue =
      autoDeployConfig && typeof autoDeployConfig.port !== 'undefined' && autoDeployConfig.port !== 22
        ? String(autoDeployConfig.port)
        : '';
    return [
      {id: 'key', name: 'DEPLOY_SSH_KEY', value: autoDeployPrivateKey, masked: true},
      {id: 'host', name: 'DEPLOY_SSH_HOST', value: host},
      {id: 'user', name: 'DEPLOY_SSH_USER', value: userValue},
      {id: 'port', name: 'DEPLOY_SSH_PORT', value: portValue, optional: true},
    ];
  }, [autoDeployPrivateKey, autoDeployConfig]);

  const secretBindings = useMemo<SecretBinding[]>(() => {
    const bindings: SecretBinding[] = [];
    let shortcut = 1;
    for (const descriptor of secretDescriptors) {
      bindings.push({shortcut: String(shortcut++), descriptor, target: 'name'});
      bindings.push({shortcut: String(shortcut++), descriptor, target: 'value'});
    }
    return bindings;
  }, [secretDescriptors]);

  const secretBindingMap = useMemo(() => {
    const map = new Map<string, SecretBinding>();
    for (const binding of secretBindings) {
      map.set(binding.shortcut, binding);
    }
    return map;
  }, [secretBindings]);

  const secretBindingPairs = useMemo<SecretBindingPair[]>(() => {
    return secretDescriptors.map((descriptor) => {
      const nameBinding = secretBindings.find((b) => b.descriptor.id === descriptor.id && b.target === 'name');
      const valueBinding = secretBindings.find((b) => b.descriptor.id === descriptor.id && b.target === 'value');
      return {
        descriptor,
        nameShortcut: nameBinding?.shortcut ?? '?',
        valueShortcut: valueBinding?.shortcut ?? '?',
      };
    });
  }, [secretDescriptors, secretBindings]);

  const setCopiedHint = () => {
    setCopyHint('Copied to clipboard!');
    if (copyHintTimeoutRef.current) {
      clearTimeout(copyHintTimeoutRef.current);
    }
    copyHintTimeoutRef.current = setTimeout(() => {
      setCopyHint(DEFAULT_COPY_HINT);
      copyHintTimeoutRef.current = null;
    }, 5000);
  };

  const copyUsingClipboard = (value: string): {ok: boolean; message: string} => {
    if (!value) {
      return {ok: false, message: '⚠ Nothing to copy'};
    }
    const platform = process.platform;
    try {
      if (platform === 'darwin') {
        const result = spawnSync('pbcopy', [], {input: value});
        if (result.status === 0) return {ok: true, message: '✓ Copied to clipboard!'};
        return {ok: false, message: '⚠ Could not copy to clipboard'};
      }
      if (platform === 'linux') {
        const result = spawnSync('xclip', ['-selection', 'clipboard'], {input: value});
        if (result.status === 0) return {ok: true, message: '✓ Copied to clipboard!'};
        return {ok: false, message: '⚠ Install xclip to copy: sudo apt install xclip'};
      }
      if (platform === 'win32') {
        const input = value.endsWith('\n') ? value : `${value}\n`;
        const result = spawnSync('clip', [], {input});
        if (result.status === 0) return {ok: true, message: '✓ Copied to clipboard!'};
        return {ok: false, message: '⚠ Copy command unavailable. Copy manually.'};
      }
      return {ok: false, message: '⚠ Copy not supported on this platform. Use manual copy.'};
    } catch {
      return {ok: false, message: '⚠ Could not copy to clipboard'};
    }
  };

  const copySecret = (binding: SecretBinding) => {
    const {descriptor, target} = binding;
    const updateKeyHint = descriptor.id === 'key' && target === 'value';
    const valueToCopy = target === 'name' ? descriptor.name : descriptor.value;
    if (!valueToCopy) {
      if (updateKeyHint) resetCopyHint();
      const msg = descriptor.optional && target === 'value'
        ? `⚠ ${descriptor.name} value not detected; add it manually on GitHub`
        : `⚠ ${descriptor.name} ${target === 'name' ? 'name' : 'value'} not available to copy`;
      setNotice(msg);
      return;
    }
    const result = copyUsingClipboard(valueToCopy);
    if (updateKeyHint) {
      if (result.ok) {
        setCopiedHint();
      } else {
        resetCopyHint();
      }
    }
    if (result.ok) {
      const what = target === 'name' ? 'name' : 'value';
      setNotice(`✓ Copied ${descriptor.name} ${what} to clipboard`);
    } else {
      setNotice(result.message);
    }
  };

  return {
    secretDescriptors,
    secretBindingPairs,
    secretBindingMap,
    copyHint,
    resetCopyHint,
    setCopyHint,
    copySecret,
  };
}
