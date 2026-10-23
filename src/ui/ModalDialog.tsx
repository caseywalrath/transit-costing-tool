import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

// The one wrapper for every modal dialog (review issue I-036, finding 5-010; WAI-ARIA authoring practices, "Dialog (Modal)"):
// - on open, focus moves to the dialog's first focusable control, or to the control marked `autoFocus`, or to the dialog itself;
// - Tab and Shift+Tab stay inside the dialog, and focus that escapes (a click on the backdrop, code that focuses elsewhere) is pulled back;
// - Escape cancels, unless the dialog is busy;
// - on close, focus returns to the control that opened the dialog when that control is still on the page (Decision 0025 item 9).
// The dialog always has an accessible name, through `labelledBy` (the id of its heading) or `label`.

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, innermost last. Only the innermost one traps focus. */
const dialogStack: HTMLElement[] = [];

/** The control that a menu item was opened from. A menu closes before its dialog opens, so the menu item cannot be the invoker. */
let menuInvoker: HTMLElement | null = null;
export function rememberDialogInvoker(element: HTMLElement | null) {
  menuInvoker = element;
  window.setTimeout(() => { if (menuInvoker === element) menuInvoker = null; });
}

function focusableIn(container: HTMLElement) { return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0 || element === document.activeElement); }

type ModalDialogProps = {
  children: ReactNode;
  /** Runs when the planner presses Escape. */
  onClose: () => void;
  /** Id of the heading that names the dialog. Give this or `label`. */
  labelledBy?: string;
  label?: string;
  role?: 'dialog' | 'alertdialog';
  /** `form` for a dialog whose controls submit together. */
  as?: 'section' | 'form';
  className?: string;
  /** True while the dialog is saving: Escape then does nothing. */
  busy?: boolean;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  onChangeCapture?: () => void;
};

export function ModalDialog({ children, onClose, labelledBy, label, role = 'dialog', as = 'section', className = 'confirm-dialog', busy = false, onSubmit, onChangeCapture }: ModalDialogProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [invoker] = useState<HTMLElement | null>(() => menuInvoker ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null));
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    dialogStack.push(container);
    if (!container.contains(document.activeElement)) (focusableIn(container)[0] ?? container).focus();
    const pullBack = (event: FocusEvent) => {
      if (dialogStack.at(-1) !== container || !(event.target instanceof Node) || container.contains(event.target)) return;
      (focusableIn(container)[0] ?? container).focus();
    };
    document.addEventListener('focusin', pullBack);
    return () => {
      document.removeEventListener('focusin', pullBack);
      const index = dialogStack.lastIndexOf(container);
      if (index >= 0) dialogStack.splice(index, 1);
      // Return focus once the dialog is gone, unless other code has already put it somewhere useful.
      window.setTimeout(() => {
        const active = document.activeElement;
        if ((!active || active === document.body) && invoker?.isConnected && !(invoker as HTMLButtonElement).disabled) invoker.focus();
      });
    };
  }, [invoker]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const container = containerRef.current;
    if (!container) return;
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation();
      if (!busyRef.current) { event.preventDefault(); onCloseRef.current(); }
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableIn(container);
    if (!focusable.length) { event.preventDefault(); container.focus(); return; }
    const first = focusable[0]!; const last = focusable.at(-1)!;
    const active = document.activeElement;
    if (!container.contains(active) || active === container) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  return <div className="modal-backdrop" role="presentation">
    {/* `form` may not carry the dialog role, so a submitting dialog is a dialog section that holds a form without a box of its own. */}
    <section ref={containerRef} className={className} role={role} aria-modal="true" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} tabIndex={-1} onKeyDown={onKeyDown}>
      {as === 'form' ? <form className="dialog-form" onSubmit={onSubmit} onChangeCapture={onChangeCapture}>{children}</form> : children}
    </section>
  </div>;
}
