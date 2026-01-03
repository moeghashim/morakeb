import { useApp, useInput } from 'ink';
import { useDB } from '../context/db';
import { useNavigation } from '../context/navigation';


export function useKeyboardShortcuts() {
  const { exit } = useApp();
  const db = useDB();
  const { screen, goBack, resetTo, formStep, setFormStep, setCurrentInput, getBackHandler } = useNavigation();

  useInput((input, key) => {
    if (key.escape || (input === 'q' && screen !== 'add')) {
      const bh = getBackHandler();
      if (bh && bh()) {
        return;
      }
      if (screen === 'main') {
        db.close();
        exit();
      } else {
        goBack();
      }
    }

    if (key.leftArrow && screen !== 'main') {
      const bh2 = getBackHandler();
      if (bh2 && bh2()) {
        return;
      }
      goBack();
    }

    if (key.ctrl && input === 'c') {
      if (screen === 'add') {
        resetTo('main');
        setFormStep(0);
        setCurrentInput('');
      } else if (screen !== 'main') {
        resetTo('main');
      } else {
        db.close();
        exit();
      }
    }
  });
}
