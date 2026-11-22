import * as React from 'react';

export interface UseCommitSearchResult {
  draft: string;
  setDraft: (next: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>;
    value: string;
    enterKeyHint: 'search';
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onFocus: () => void;
    onBlur: () => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  };
  commitNow: () => void;
  clear: () => void;
}

/**
 * Buffers search input locally while typing to prevent laggy real-time filtering or API storms.
 * Commits the draft value on Enter (non-IME), input blur, or clicking/tapping outside on mobile/desktop.
 * Explicit `clear()` resets both draft and committed state immediately.
 */
export function useCommitSearch(
  committedValue: string,
  onCommit: (nextValue: string) => void,
): UseCommitSearchResult {
  const [draft, setDraftState] = React.useState(committedValue);
  const [isFocused, setIsFocused] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const draftRef = React.useRef(committedValue);
  const lastCommittedRef = React.useRef(committedValue);
  const onCommitRef = React.useRef(onCommit);

  React.useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  React.useEffect(() => {
    lastCommittedRef.current = committedValue;
    draftRef.current = committedValue;
    setDraftState(committedValue);
  }, [committedValue]);

  const setDraft = React.useCallback((next: string) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const commitValue = React.useCallback((next: string) => {
    if (next !== lastCommittedRef.current) {
      lastCommittedRef.current = next;
      onCommitRef.current(next);
    }
  }, []);

  const commitNow = React.useCallback(() => {
    commitValue(draftRef.current);
  }, [commitValue]);

  const clear = React.useCallback(() => {
    draftRef.current = '';
    setDraftState('');
    if (lastCommittedRef.current !== '') {
      lastCommittedRef.current = '';
      onCommitRef.current('');
    }
  }, []);

  React.useEffect(() => {
    if (!isFocused) return;
    const handleOutsidePointer = (event: Event) => {
      const target = event.target as Node | null;
      if (containerRef.current && target && containerRef.current.contains(target)) {
        return;
      }
      commitNow();
      if (document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointer, true);
    document.addEventListener('touchstart', handleOutsidePointer, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
      document.removeEventListener('touchstart', handleOutsidePointer, true);
    };
  }, [isFocused, commitNow]);

  const inputProps = {
    ref: inputRef,
    value: draft,
    enterKeyHint: 'search' as const,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(event.target.value);
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => {
      setIsFocused(false);
      commitNow();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
        event.preventDefault();
        commitNow();
      }
    },
  };

  return {
    draft,
    setDraft,
    containerRef,
    inputRef,
    inputProps,
    commitNow,
    clear,
  };
}
