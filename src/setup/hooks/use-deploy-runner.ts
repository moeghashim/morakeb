import {useCallback, useEffect, useRef, useState} from 'react';
import {promises as fs} from 'node:fs';
import {ensureDir} from '../sys';
import {runDeploy, type DeployReporter, DeployError} from '../deploy';
import {spinnerFrames} from '../shared';

export type DeployStatus = 'idle' | 'running' | 'failed' | 'success';

export type DeployStartParams = {
  host: string;
  dest: string;
  debug: boolean;
  debugDir: string;
  debugLogPath: string;
  onSuccess: () => void;
};

export type DeployRunnerState = {
  status: DeployStatus;
  currentStage: string | null;
  error: string | null;
  spinnerFrame: string;
};

export type DeployRunner = DeployRunnerState & {
  start: (params: DeployStartParams) => void;
  reset: () => void;
};

const stageGroups: Array<{label: string; stages: string[]}> = [
  {label: 'Testing locally', stages: ['Local typecheck', 'Local tests']},
  {label: 'Checking VPS', stages: ['Ensuring prerequisites (apt, Bun, Droid)', 'Ensuring app directory']},
  {label: 'Uploading', stages: ['Uploading source', 'Ensuring .env file']},
  {label: 'Installing', stages: ['Installing dependencies']},
  {label: 'Testing production', stages: ['Typecheck', 'Tests']},
  {label: 'Making backup', stages: ['Backup database']},
  {label: 'Building', stages: ['Build']},
  {label: 'Migrating', stages: ['Migrate DB', 'Seed AI']},
  {label: 'Restarting', stages: ['Ensuring systemd service', 'Restarting service']},
  {label: 'Running health check', stages: ['Health check']},
];

const stageToLabel = new Map<string, string>(
  stageGroups.flatMap(({label, stages}) => stages.map((stage) => [stage, label] as const)),
);

export function useDeployRunner(): DeployRunner {
  const [status, setStatus] = useState<DeployStatus>('idle');
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleSpinner, setTitleSpinner] = useState(0);
  const activeRunRef = useRef<symbol | null>(null);
  const titleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resetState = useCallback(() => {
    setStatus('idle');
    setCurrentStage(null);
    setError(null);
    setTitleSpinner(0);
    activeRunRef.current = null;
  }, []);

  const abortCurrent = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abortCurrent();
    resetState();
  }, [abortCurrent, resetState]);

  const clearTimer = () => {
    if (titleTimerRef.current) {
      clearInterval(titleTimerRef.current);
      titleTimerRef.current = null;
    }
  };

  const start = useCallback(
    (params: DeployStartParams) => {
      if (status === 'running') return;
      abortCurrent();
      resetState();
      const runId = Symbol('deploy');
      activeRunRef.current = runId;
      setStatus('running');
      const controller = new AbortController();
      abortRef.current = controller;

      const runAsync = async () => {
        const {host, dest, debug, debugDir, debugLogPath, onSuccess} = params;
        if (debug) {
          try {
            await ensureDir(debugDir);
            const header = `=== DEBUG START ${new Date().toISOString()} ===\nHOST: ${host}\nDEST: ${dest}\n\n`;
            await fs.writeFile(debugLogPath, header, 'utf8');
          } catch {
            // ignore debug setup errors
          }
        }

        const appendDebug = async (line: string) => {
          if (!debug || activeRunRef.current !== runId) return;
          try {
            await fs.appendFile(debugLogPath, `${new Date().toISOString()} ${line}\n`, 'utf8');
          } catch {
            // ignore debug write errors
          }
        };

        const isActive = () => activeRunRef.current === runId;

        titleTimerRef.current = setInterval(() => setTitleSpinner((s) => (s + 1) % spinnerFrames.length), 100);

        const reporter: DeployReporter = {
          info: (message) => {
            if (!isActive()) return;
            void appendDebug(`[info] ${message}`);
          },
          stage: (name) => {
            if (!isActive()) return;
            const label = stageToLabel.get(name) ?? name;
            setCurrentStage(label);
            void appendDebug(`[stage] ${name}`);
          },
          ok: (name) => {
            if (!isActive()) return;
            void appendDebug(`[ok] ${name}`);
          },
          fail: (name, message) => {
            if (!isActive()) return;
            const detail = message ?? 'failed';
            void appendDebug(`[fail] ${name}${message ? `: ${message}` : ''}`);
            setError(detail);
            const label = stageToLabel.get(name) ?? name;
            setCurrentStage(label);
            setStatus('failed');
          },
        };

        try {
          await runDeploy({host, dest}, reporter, controller.signal);
          if (!isActive()) return;
          setCurrentStage(null);
          setStatus('success');
          onSuccess();
        } catch (err) {
          if (!isActive()) return;
          if (err instanceof Error && err.name === 'AbortError') {
            setStatus('idle');
            setError(null);
            setCurrentStage(null);
          } else {
            const message =
              err instanceof DeployError
                ? err.details ?? `Stage "${err.stage}" failed`
                : err instanceof Error
                  ? err.message
                  : 'Deployment failed';
            setError(message);
            void appendDebug(`[error] ${message}`);
            setStatus('failed');
          }
        } finally {
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
          clearTimer();
          if (activeRunRef.current === runId) {
            activeRunRef.current = null;
          }
        }
      };

      void runAsync();
    },
    [abortCurrent, resetState, status],
  );

  useEffect(
    () => () => {
      clearTimer();
      activeRunRef.current = null;
      abortCurrent();
    },
    [abortCurrent],
  );

  return {
    status,
    currentStage,
    error,
    spinnerFrame: spinnerFrames[titleSpinner],
    start,
    reset,
  };
}
