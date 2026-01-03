import {useCallback, useState} from 'react';
import {buildSetupTasks} from '../tasks';
import type {Mode, RunMode, Task, TaskResult} from '../types';

export type UseTasksRunnerParams = {
  appDir: string;
  home: string;
  user: string;
};

export type TasksRunner = {
  tasks: Task[];
  results: Record<string, TaskResult>;
  notes: Record<string, string>;
  run: (mode: Mode, runMode: RunMode | null) => Promise<void>;
  reset: () => void;
};

export function useTasksRunner({appDir, home, user}: UseTasksRunnerParams): TasksRunner {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [results, setResults] = useState<Record<string, TaskResult>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const run = useCallback(
    async (mode: Mode, runMode: RunMode | null) => {
      setNotes({});
      setResults({});
      const built = await buildSetupTasks({
        mode,
        runMode,
        appDir,
        home,
        user,
        onTaskNote: (key, value) => {
          setNotes((prev) => ({...prev, [key]: value}));
        },
      });
      setTasks(built);

      for (const task of built) {
        const result = !task.enabled ? 'skipped' : await task.run();
        setResults((prev) => ({...prev, [task.key]: result}));
      }
    },
    [appDir, home, user],
  );

  const reset = useCallback(() => {
    setTasks([]);
    setResults({});
    setNotes({});
  }, []);

  return {
    tasks,
    results,
    notes,
    run,
    reset,
  };
}
