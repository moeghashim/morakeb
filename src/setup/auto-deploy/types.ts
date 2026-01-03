export type AutoDeployPhase =
  | 'auto-deploy-host'
  | 'auto-deploy-dest'
  | 'auto-deploy-generate'
  | 'auto-deploy-show-key'
  | 'auto-deploy-done';

export type AutoDeployStatus = 'idle' | 'generating' | 'success' | 'failed';

export type SecretCard = {
  id: 'key' | 'host' | 'user' | 'port';
  name: string;
  value: string;
  optional?: boolean;
  helperName: string;
  helperValue: string;
  highlightValue: boolean;
};

export type SecretDescriptor = {
  id: SecretCard['id'];
  name: string;
  value: string;
  optional?: boolean;
  masked?: boolean;
};

export const AUTO_DEPLOY_MASK_LENGTH = 36;
export const DEFAULT_COPY_HINT = 'Press 2 to copy value';
