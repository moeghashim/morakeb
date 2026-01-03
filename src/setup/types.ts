export type Mode = 'local' | 'vps' | 'diag';
export type RunMode = 'background' | 'foreground';

export type TaskResult = 'pending' | 'skipped' | 'installed' | 'updated' | 'ok' | 'failed';

export type Task = {
  key: string;
  title: string;
  mode: Mode | 'both';
  enabled: boolean;
  run: () => Promise<TaskResult>;
};

export type SetupPhase =
  | 'mode'
  | 'runmode'
  | 'review'
  | 'run'
  | 'done'
  | 'confirm-rollback'
  | 'scp-options'
  | 'scp-host'
  | 'scp-dest'
  | 'scp-run'
  | 'scp-done'
  | 'auto-deploy-host'
  | 'auto-deploy-dest'
  | 'auto-deploy-generate'
  | 'auto-deploy-show-key'
  | 'auto-deploy-done';
