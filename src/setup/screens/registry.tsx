import React from 'react';
import {Box, Text} from 'ink';
import path from 'node:path';
import {
  isLinux,
  isDarwin,
  isRoot,
  hasCmd,
  run,
  systemctlAvailable,
} from '../sys';
import type {Mode, RunMode, SetupPhase, Task, TaskResult} from '../types';
import {
  ModeScreen,
  RunModeScreen,
  DiagnosticsScreen,
  ConfirmRollbackScreen,
  DeployOptionsScreen,
} from './core';
import type {SelectOption} from './select';
import {InputScreen} from './prompt';
import {DeployProgressScreen, DeployCompleteScreen} from './deploy';
import {TaskProgressScreen, TaskSummaryScreen} from './tasks';
import {SummaryPanel} from './summary';

type ModeOptionValue = Mode | 'scp' | 'auto-deploy';
type DeployOptionValue = 'next' | 'toggle-debug';
type DiagnosticsActionValue = 'rollback';
type YesNoOption = 'yes' | 'no';
type ConfirmRollbackOption = YesNoOption;
type DeployCompleteOption = YesNoOption;

type TaskRecords = Record<string, TaskResult>;

export type SetupScreenContext = {
  phase: SetupPhase;
  mode: Mode | null;
  runMode: RunMode | null;
  setMode: (mode: Mode | null) => void;
  setPhase: (phase: SetupPhase) => void;
  setRunMode: (runMode: RunMode | null) => void;
  runSetupTasks: (mode: Mode, runMode: RunMode | null) => void;
  workflowExists: boolean;
  debug: boolean;
  toggleDebug: () => void;
  scpHost: string;
  setScpHost: (value: string) => void;
  scpDest: string;
  setScpDest: (value: string) => void;
  persistHostDest: (host: string, dest: string) => Promise<void>;
  resetDeploy: () => void;
  deployStatus: 'idle' | 'running' | 'failed' | 'success';
  currentStage: string | null;
  deploySpinner: string;
  deployError: string | null;
  debugLogPath: string;
  tasks: Task[];
  results: TaskRecords;
  taskMessages: Record<string, string>;
  taskSpinnerFrame: string;
  user: string;
  setModeToNull: () => void;
  summaryMode: Mode | null;
  summaryRunMode: RunMode | null;
  resetAutoDeploy: () => void;
};

export function renderSetupScreen(context: SetupScreenContext): React.ReactNode {
  const {
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
    persistHostDest,
    resetDeploy,
    deployStatus,
    currentStage,
    deploySpinner,
    deployError,
    debugLogPath,
    tasks,
    results,
    taskMessages,
    taskSpinnerFrame,
    user,
    setModeToNull,
    summaryMode,
    summaryRunMode,
    resetAutoDeploy,
  } = context;

  if (phase === 'mode') {
    const options: SelectOption<ModeOptionValue>[] = [
      {label: 'Local setup', value: 'local'},
      ...(isLinux() ? [{label: 'VPS setup (Linux/systemd)', value: 'vps' as ModeOptionValue}] : []),
      {label: 'Deploy to VPS', value: 'scp'},
      ...(!workflowExists
        ? [{label: 'Configure GitHub auto-deploy', value: 'auto-deploy' as ModeOptionValue}]
        : []),
      {label: 'Diagnostics', value: 'diag'},
    ];
    return (
      <ModeScreen
        options={options}
        hint={'Use ↑↓ to navigate, Enter to select, Esc to exit'}
        onSelect={(item) => {
          const value = item.value;
          if (value === 'diag') {
            setMode('diag');
            setPhase('review');
            return;
          }
          if (value === 'local') {
            setMode('local');
            setRunMode('foreground');
            void runSetupTasks('local', 'foreground');
            return;
          }
          if (value === 'vps') {
            setMode('vps');
            setPhase('runmode');
            return;
          }
          if (value === 'scp') {
            setMode(null);
            setPhase('scp-options');
            return;
          }
          if (value === 'auto-deploy') {
            setMode(null);
            resetAutoDeploy();
            setPhase('auto-deploy-host');
          }
        }}
      />
    );
  }

  if (phase === 'scp-options') {
    const items: SelectOption<DeployOptionValue>[] = [
      {label: 'Enter host', value: 'next'},
      {label: `Debug: ${debug ? 'on' : 'off'}`, value: 'toggle-debug'},
    ];
    return (
      <DeployOptionsScreen
        debugEnabled={debug}
        items={items}
        hint={'Use ↑↓ to navigate, Enter to select, Esc/← to go back'}
        onSelect={(item) => {
          if (item.value === 'toggle-debug') {
            toggleDebug();
            return;
          }
          if (item.value === 'next') {
            setPhase('scp-host');
          }
        }}
      />
    );
  }

  if (phase === 'runmode') {
    const options: SelectOption<RunMode>[] = [
      {label: 'Run in background (systemd)', value: 'background'},
      {label: 'Foreground only (test)', value: 'foreground'},
    ];
    return (
      <RunModeScreen
        options={options}
        hint={'Use ↑↓ to navigate, Enter to select, Esc/← to go back'}
        onSelect={(item) => {
          setRunMode(item.value);
          void runSetupTasks('vps', item.value);
        }}
      />
    );
  }

  if (phase === 'review' && mode === 'diag') {
    const infoLines: string[] = [
      `OS: ${isLinux() ? 'linux' : isDarwin() ? 'darwin' : process.platform}`,
      `User: ${user} (root: ${isRoot()})`,
      `bun: ${hasCmd('bun') ? 'present' : 'missing'}`,
      `droid: ${hasCmd('droid') ? 'present' : 'missing'}`,
      `systemctl: ${systemctlAvailable() ? 'present' : 'missing'}`,
    ];
    const actions: SelectOption<DiagnosticsActionValue>[] = [];
    if (isLinux() && systemctlAvailable()) {
      actions.push({label: 'Remove setup (rollback)', value: 'rollback'});
    }
    return (
      <DiagnosticsScreen
        infoLines={infoLines}
        actions={actions}
        actionHint={'Use ↑↓ to navigate, Enter to select, Esc/← to go back'}
        fallbackHint={'Esc/← to go back'}
        onSelectAction={(item) => {
          if (item.value === 'rollback') {
            setPhase('confirm-rollback');
          }
        }}
      />
    );
  }

  if (phase === 'confirm-rollback') {
    const items: SelectOption<ConfirmRollbackOption>[] = [
      {label: 'Yes, remove setup', value: 'yes'},
      {label: 'No, cancel', value: 'no'},
    ];
    return (
      <ConfirmRollbackScreen
        options={items}
        hint={'Use ↑↓ to navigate, Enter to select, Esc/← to go back'}
        onSelect={async (item) => {
          if (item.value === 'no') {
            setPhase('review');
            return;
          }
          if (isLinux() && systemctlAvailable() && isRoot()) {
            run('systemctl stop changes');
            run('systemctl disable changes');
            run('rm -f /etc/systemd/system/changes.service');
            run('systemctl daemon-reload');
          }
          run(`rm -rf ${path.join(process.cwd(), 'data')}`);
          run(`rm -f ${path.join(process.cwd(), '.env')}`);
          run(`rm -rf ${path.join(process.cwd(), 'node_modules')}`);
          setPhase('review');
        }}
      />
    );
  }

  if (phase === 'scp-host') {
    return (
      <InputScreen
        title={`Deploy to VPS${debug ? ': debug mode' : ''}`}
        prompt="Enter host (e.g., user@1.2.3.4):"
        value={scpHost}
        inputKey="deploy-host-input"
        onChange={setScpHost}
        onSubmit={(value) => {
          const trimmed = value.trim();
          setScpHost(trimmed);
          setPhase('scp-dest');
        }}
      />
    );
  }

  if (phase === 'scp-dest') {
    return (
      <InputScreen
        title={`Destination path${debug ? ': debug mode' : ''}`}
        prompt="Enter destination path on VPS (default /opt/changes):"
        value={scpDest}
        inputKey="deploy-dest-input"
        onChange={setScpDest}
        onSubmit={async (value) => {
          const trimmed = value.trim() || '/opt/changes';
          setScpDest(trimmed);
          try {
            await persistHostDest(scpHost, trimmed);
          } catch {
            // ignore preference persistence errors
          }
          resetDeploy();
          setPhase('scp-run');
        }}
      />
    );
  }

  if (phase === 'scp-run') {
    const displayStatus = deployStatus === 'idle' ? 'running' : deployStatus;
    const helpText =
      displayStatus === 'failed'
        ? 'Esc/← to go back, r to retry'
        : displayStatus === 'running'
          ? 'Esc to cancel deploy'
          : 'Esc/← to go back';
    return (
      <DeployProgressScreen
        status={displayStatus}
        debugMode={debug}
        debugLogPath={debugLogPath}
        spinnerFrame={deploySpinner}
        host={scpHost}
        dest={scpDest}
        currentStage={currentStage}
        errorMessage={deployError}
        helpText={helpText}
      />
    );
  }

  if (phase === 'scp-done') {
    const items: SelectOption<DeployCompleteOption>[] = [
      {label: 'Yes, setup auto-deploy', value: 'yes'},
      {label: 'No, skip', value: 'no'},
    ];
    return (
      <DeployCompleteScreen
        host={scpHost}
        dest={scpDest}
        items={items}
        hint="Use ↑↓ to navigate, Enter to select, Esc to go back"
        onSelect={(item) => {
          if (item.value === 'yes') {
            resetAutoDeploy();
            setPhase('auto-deploy-generate');
          } else {
            setPhase('mode');
            setModeToNull();
          }
        }}
      />
    );
  }

  if (phase === 'run') {
    const displayTasks = tasks.map((task) => ({key: task.key, title: task.title}));
    return (
      <TaskProgressScreen
        spinnerFrame={taskSpinnerFrame}
        tasks={displayTasks}
        results={results}
        hint="Esc to go back"
      />
    );
  }

  if (phase === 'done' && mode) {
    const displayTasks = tasks.map((task) => ({key: task.key, title: task.title}));
    return (
      <TaskSummaryScreen
        tasks={displayTasks}
        results={results}
        notes={taskMessages}
        summary={<SummaryPanel mode={summaryMode ?? mode} runMode={summaryRunMode} />}
        hint="Esc to go back"
      />
    );
  }

  return (
    <Box padding={1}>
      <Text>Loading…</Text>
    </Box>
  );
}
