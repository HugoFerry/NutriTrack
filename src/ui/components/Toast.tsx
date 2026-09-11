import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastFn = (msg: string, kind?: 'ok' | 'err') => void;
const Ctx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err'; key: number } | null>(null);
  const timer = useRef<number | null>(null);
  const show = useCallback<ToastFn>((msg, kind = 'ok') => {
    if (timer.current) window.clearTimeout(timer.current);
    setToast({ msg, kind, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), kind === 'err' ? 3200 : 2200);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div key={toast.key} className={'toast' + (toast.kind === 'err' ? ' err' : '')} style={toast.kind === 'err' ? { animationDuration: '3.2s' } : undefined}>
          {toast.msg}
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
