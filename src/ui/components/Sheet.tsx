import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from './Icons';

// Empilement : chaque feuille ouverte passe au-dessus de la précédente.
let stack = 0;

export function Sheet({ open, onClose, title, children, footer, full, right }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; full?: boolean; right?: ReactNode }) {
  const level = useRef(0);
  useEffect(() => {
    if (!open) return;
    level.current = ++stack;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      stack = Math.max(0, stack - 1);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  const z = 40 + (level.current || stack + 1) * 2;
  return (
    <>
      <div className="sheet-bg" style={{ zIndex: z }} onClick={onClose} />
      <div className={'sheet' + (full ? ' full' : '')} style={{ zIndex: z + 1 }} role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        {(title || right) && (
          <div className="sheet-h">
            <h2>{title}</h2>
            <div className="row">
              {right}
              <button className="iconbtn" onClick={onClose} aria-label="Fermer"><IconClose /></button>
            </div>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>
  );
}
