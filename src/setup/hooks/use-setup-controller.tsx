import React, {useEffect, useState} from 'react';
import {getHostDest, setHostDest} from '../prefs';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {currentUser, homeDirFor} from '../sys';
import {useAutoDeployFlow} from '../auto-deploy-flow';
import {spinnerFrames} from '../shared';
import type {Mode, RunMode, SetupPhase} from '../types';
import {renderSetupScreen} from '../screens/registry';
import {useTasksRunner} from './use-tasks-runner';
import {useDeployRunner} from './use-deploy-runner';

export type SetupController = {
  screen: React.ReactNode;
  handleInput: (input: string, key: {return?: boolean; escape?: boolean; leftArrow?: boolean}) => void;
};

export function useSetupController({exit}: {exit: () => void}): SetupController {
  const [mode, setMode] = useState<Mode | null>(null);
  const [phase, setPhase] = useState<SetupPhase>('mode');
  const appDir = process.cwd();
  const user = currentUser();
  const [runMode, setRunMode] = useState<RunMode | null>(null);
  const home = homeDirFor(user);
  const [scpHost, setScpHost] = useState('');
  const [scpDest, setScpDest] = useState('/opt/changes');
  const [debug, setDebug] = useState(false);
  const debugDir = path.join(appDir, 'tmp');
  const debugLogPath = path.join(debugDir, 'debug.log');
  const [taskSpinner, setTaskSpinner] = useState(0);
  const {tasks, results, notes: taskMessages, run: runTaskPipeline} = useTasksRunner({
    appDir,
    home,
    user,
  });
  const {
    status: deployStatus,
    currentStage,
    error: deployError,
    spinnerFrame: deploySpinner,
    start: startDeploy,
    reset: resetDeploy,
  } = useDeployRunner();

  const autoDeploy = useAutoDeployFlow({
    phase,
    setPhase: setPhase as (next: string) => void,
    scpHost,
    setScpHost,
    scpDest,
    setScpDest,
    persistHostDest: setHostDest,
    appDir,
  });

  const handleBack = () => {
    if (autoDeploy.handleBack()) {
      return;
    }
    switch (phase) {
      case 'mode':
        exit();
        return;
      case 'runmode':
        setMode(null);
        setPhase('mode');
        return;
      case 'review':
        setMode(null);
        setPhase('mode');
        return;
      case 'confirm-rollback':
        setPhase('review');
        return;
      case 'scp-options':
        setMode(null);
        setPhase('mode');
        return;
      case 'scp-host':
        setPhase('scp-options');
        return;
      case 'scp-dest':
        setPhase('scp-host');
        return;
      case 'scp-run':
        resetDeploy();
        setMode(null);
        setPhase('mode');
        return;
      case 'scp-done':
        setMode(null);
        setPhase('mode');
        return;
      case 'run':
      case 'done':
        setMode(null);
        setPhase('mode');
        return;
      default:
        return;
    }
  };

  const workflowPath = path.join(appDir, '.github', 'workflows', 'deploy.yml');
  const workflowExists = existsSync(workflowPath);

  const handleInput = (input: string, key: {return?: boolean; escape?: boolean; leftArrow?: boolean}) => {
    if (autoDeploy.handleInput(input, key)) {
      return;
    }
    if (phase === 'auto-deploy-done' && key.return) {
      setPhase('mode');
      setMode(null);
      return;
    }
    if (phase === 'scp-done' && workflowExists && key.return) {
      setPhase('mode');
      setMode(null);
      return;
    }
    const lower = input.toLowerCase();
    const isTextPhase =
      phase === 'scp-host' ||
      phase === 'scp-dest' ||
      phase === 'auto-deploy-host' ||
      phase === 'auto-deploy-dest';
    if (lower === 'q') {
      exit();
      return;
    }
    if (key.escape || (!isTextPhase && key.leftArrow)) {
      handleBack();
      return;
    }
    if (lower === 'r' && phase === 'scp-run' && deployStatus === 'failed') {
      resetDeploy();
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadPrefs = async () => {
      try {
        const {host, dest} = await getHostDest();
        if (cancelled) return;
        if (host) setScpHost(host);
        if (dest) setScpDest(dest);
      } catch {
        // ignore preference load errors
      }
    };
    void loadPrefs();
    return () => {
      cancelled = true;
    };
  }, []);

  const runSetupTasks = async (selected: Mode, selectedRunMode: RunMode | null) => {
    setPhase('run');
    await runTaskPipeline(selected, selectedRunMode);
    setPhase('done');
  };

  useEffect(() => {
    if (phase !== 'run') return;
    const timer = setInterval(() => setTaskSpinner((s) => (s + 1) % spinnerFrames.length), 100);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'scp-run') return;
    if (deployStatus !== 'idle') return;
    startDeploy({
      host: scpHost,
      dest: scpDest,
      debug,
      debugDir,
      debugLogPath,
      onSuccess: () => setPhase('scp-done'),
    });
  }, [phase, deployStatus, startDeploy, scpHost, scpDest, debug, debugDir, debugLogPath]);

  const autoScreen = autoDeploy.render();
  if (autoScreen) {
    return {screen: autoScreen, handleInput};
  }

  const toggleDebug = () => setDebug((d) => !d);

  const screen = renderSetupScreen({
    phase,
    mode,
    runMode,
    setMode,
    setPhase,
    setRunMode,
    runSetupTasks,
    workflowExists,
    debug,
    toggleDebug,
    scpHost,
    setScpHost,
    scpDest,
    setScpDest,
    persistHostDest: setHostDest,
    resetDeploy,
    deployStatus,
    currentStage,
    deploySpinner,
    deployError,
    debugLogPath,
    tasks,
    results,
    taskMessages,
    taskSpinnerFrame: spinnerFrames[taskSpinner],
    user,
    setModeToNull: () => setMode(null),
    summaryMode: mode,
    summaryRunMode: runMode,
    resetAutoDeploy: autoDeploy.reset,
  });

  return {
    screen,
    handleInput,
  };
}
