import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type DialogVariant = 'alert' | 'confirm' | 'success' | 'error';

interface DialogOptions {
  title?: string;
  message: ReactNode;
  variant?: DialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface OpenDialog {
  (options: DialogOptions): Promise<boolean>;
  alert: (message: ReactNode, title?: string) => Promise<void>;
  success: (message: ReactNode, title?: string) => Promise<void>;
  error: (message: ReactNode, title?: string) => Promise<void>;
  confirm: (message: ReactNode, options?: Partial<DialogOptions>) => Promise<boolean>;
}

const DialogContext = createContext<OpenDialog | null>(null);

export function useDialog(): OpenDialog {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within DialogProvider');
  }
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    (DialogOptions & { resolve: (v: boolean) => void }) | null
  >(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const open = useCallback((options: DialogOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const openDialog = useCallback(
    (options: DialogOptions) => open(options),
    [open]
  );
  openDialog.alert = useCallback(
    (message: ReactNode, title = 'Aviso') =>
      open({ title, message, variant: 'alert', confirmLabel: 'OK' }).then(() => {}),
    [open]
  );
  openDialog.success = useCallback(
    (message: ReactNode, title = 'Sucesso') =>
      open({ title, message, variant: 'success', confirmLabel: 'OK' }).then(() => {}),
    [open]
  );
  openDialog.error = useCallback(
    (message: ReactNode, title = 'Erro') =>
      open({ title, message, variant: 'error', confirmLabel: 'OK' }).then(() => {}),
    [open]
  );
  openDialog.confirm = useCallback(
    (message: ReactNode, options: Partial<DialogOptions> = {}) => {
      const isDestructive = options.variant === 'confirm';
      return open({
        title: options.title ?? 'Confirmar',
        message,
        variant: options.variant ?? 'confirm',
        confirmLabel: options.confirmLabel ?? 'Confirmar',
        cancelLabel: options.cancelLabel ?? 'Cancelar',
        ...(isDestructive ? {} : {}),
      });
    },
    [open]
  );

  const close = (result: boolean) => {
    stateRef.current?.resolve?.(result);
    setState(null);
  };

  return (
    <DialogContext.Provider value={openDialog}>
      {children}
      <DialogSurface state={state} onClose={close} />
    </DialogContext.Provider>
  );
}

const variantStyles: Record<DialogVariant, { icon: string; color: string; ring: string }> = {
  confirm: {
    icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    color: '#B45309',
    ring: 'rgba(180, 83, 9, 0.15)',
  },
  alert: {
    icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    color: '#B45309',
    ring: 'rgba(180, 83, 9, 0.15)',
  },
  success: {
    icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    color: '#065F46',
    ring: 'rgba(6, 95, 70, 0.15)',
  },
  error: {
    icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    color: '#DC2626',
    ring: 'rgba(220, 38, 38, 0.15)',
  },
};

function DialogSurface({
  state,
  onClose,
}: {
  state: (DialogOptions & { resolve: (v: boolean) => void }) | null;
  onClose: (result: boolean) => void;
}) {
  if (!state) return null;
  const variant = state.variant ?? 'alert';
  const isConfirm = variant === 'confirm';
  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-dialog-fade"
        onClick={() => {
          if (isConfirm) onClose(false);
        }}
      />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-dialog-pop"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
              style={{ background: styles.ring, color: styles.color }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={styles.icon} />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              {state.title && (
                <h3
                  className="text-base font-bold text-gray-900 mb-1.5"
                  style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                  {state.title}
                </h3>
              )}
              <div className="text-sm text-gray-600 leading-relaxed break-words">{state.message}</div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6 justify-end">
          {isConfirm && (
            <button
              onClick={() => onClose(false)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {state.cancelLabel ?? 'Cancelar'}
            </button>
          )}
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{
              background: variant === 'confirm' || variant === 'error' ? '#DC2626' : '#009C60',
              boxShadow: `0 0 0 3px ${styles.ring}`,
            }}
            onClick={() => onClose(true)}
            autoFocus
          >
            {state.confirmLabel ?? (isConfirm ? 'Confirmar' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}
