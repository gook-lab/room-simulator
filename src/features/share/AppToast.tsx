import { useEffect } from 'react';
import { useStore } from '../../state/store';

export function AppToast() {
  const toast = useStore((s) => s.toast);
  const dismissToast = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, toast.detail ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  return (
    <div className="app-toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="app-toast" key={toast.id}>
          <div className="app-toast__body">
            <div className="app-toast__text">{toast.text}</div>
            {toast.detail && <div className="app-toast__detail">{toast.detail}</div>}
          </div>
          <button className="app-toast__close" onClick={dismissToast} aria-label="알림 닫기">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
