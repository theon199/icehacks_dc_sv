import { useCallback, useState } from 'react';

export interface Field {
  value: string;
  setValue: (value: string) => void;
  /** Inline message, shown once the person has left the field or tried to submit. */
  error: string | null;
  onBlur: () => void;
  /** Marks the field as visited and returns whether it is valid. */
  validate: () => boolean;
}

/**
 * Text field state with gentle inline validation: no error while someone is still typing their
 * first attempt, live feedback after they leave the field or submit.
 */
export function useField(rule: (value: string) => string | null, initial = ''): Field {
  const [value, setValue] = useState(initial);
  const [visited, setVisited] = useState(false);
  const message = rule(value);
  const onBlur = useCallback(() => {
    if (value) setVisited(true);
  }, [value]);
  const validate = useCallback(() => {
    setVisited(true);
    return message == null;
  }, [message]);
  return { value, setValue, error: visited ? message : null, onBlur, validate };
}
