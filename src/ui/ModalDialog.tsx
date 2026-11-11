import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

// The one wrapper for every modal dialog (review issue I-036, finding 5-010; WAI-ARIA authoring practices, "Dialog (Modal)"):
// - on open, focus moves to the dialog's first focusable control, or to the control marked `autoFocus`, or to the dialog itself;
// - Tab and Shift+Tab stay inside the dialog, and focus that escapes (a click on the backdrop, code that focuses elsewhere) is pulled back;
// - Escape cancels, unless the dialog is busy;
// - on close, focus returns to the control that opened the dialog when that control is still on the page (Decision 0025 item 9).
// The dialog always has an accessible name, through `labelledBy` (the id of its heading) or `label`.
// - the heading is a drag handle: the dialog moves with the pointer and stays on screen (Decision 0068). It opens centered each time.

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

// Decision 0068: a drag starts after the pointer moves this far, and dragging is off at this viewport width or narrower.
const DRAG_THRESHOLD_PX = 3;
const NARROW_VIEWPORT = '(max-width: 600px)';
type Offset = { x: number; y: number };
const NO_OFFSET: Offset = { x: 0, y: 0 };
const clampTo = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

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
  /** False for a dialog that must not move (Decision 0068). Default true: the heading (`labelledBy`) is the drag handle. */
  draggable?: boolean;
};

export function ModalDialog({ children, onClose, labelledBy, label, role = 'dialog', as = 'section', className = 'confirm-dialog', busy = false, onSubmit, onChangeCapture, draggable = true }: ModalDialogProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [invoker] = useState<HTMLElement | null>(() => menuInvoker ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null));
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  // The offset from the centered position. The ref is read by the drag listeners; the state renders it.
  const [offset, setOffset] = useState<Offset>(NO_OFFSET);
  const offsetRef = useRef<Offset>(NO_OFFSET);

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

  // Decision 0068: the heading moves the dialog. Listeners are attached to the heading only; pointer capture keeps the drag going outside it.
  useEffect(() => {
    const container = containerRef.current;
    const handle = draggable && labelledBy ? document.getElementById(labelledBy) : null;
    if (!container || !handle || !container.contains(handle)) return;
    const narrow = () => window.matchMedia(NARROW_VIEWPORT).matches;
    let start: { x: number; y: number; offset: Offset; pointerId: number } | null = null;
    let dragging = false;

    // Sets the offset at once, so the next measurement reads the moved dialog.
    const setOffsetNow = (next: Offset) => {
      if (next.x === offsetRef.current.x && next.y === offsetRef.current.y) return;
      offsetRef.current = next;
      flushSync(() => setOffset(next));
    };
    // Limits the offset so the handle stays inside the window. The untransformed handle position is its measured rect minus the current offset.
    const place = (next: Offset) => {
      const rect = handle.getBoundingClientRect();
      const left = rect.left - offsetRef.current.x;
      const top = rect.top - offsetRef.current.y;
      setOffsetNow({
        x: clampTo(next.x, -left, window.innerWidth - rect.width - left),
        y: clampTo(next.y, -top, window.innerHeight - rect.height - top),
      });
    };
    // Window resize and dialog resize: clear the offset when narrow; otherwise keep the handle on screen. A centered dialog is left alone.
    const reclamp = () => {
      if (narrow()) setOffsetNow(NO_OFFSET);
      else if (offsetRef.current.x || offsetRef.current.y) place(offsetRef.current);
    };
    const endDrag = () => {
      if (start && handle.hasPointerCapture(start.pointerId)) handle.releasePointerCapture(start.pointerId);
      start = null;
      dragging = false;
      container.classList.remove('modal-dragging');
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || narrow()) return;
      // A press on a control inside the handle (button, input, link) does not start a drag.
      if (event.target instanceof Element && event.target.closest(FOCUSABLE)) return;
      start = { x: event.clientX, y: event.clientY, offset: offsetRef.current, pointerId: event.pointerId };
      dragging = false;
      handle.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!start || narrow()) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!dragging) {
        if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
        dragging = true;
        container.classList.add('modal-dragging');
      }
      place({ x: start.offset.x + dx, y: start.offset.y + dy });
    };

    handle.classList.add('modal-drag-handle');
    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('lostpointercapture', endDrag);
    window.addEventListener('resize', reclamp);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reclamp);
    observer?.observe(container);
    return () => {
      handle.removeEventListener('pointerdown', onPointerDown);
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', endDrag);
      handle.removeEventListener('pointercancel', endDrag);
      handle.removeEventListener('lostpointercapture', endDrag);
      window.removeEventListener('resize', reclamp);
      observer?.disconnect();
      handle.classList.remove('modal-drag-handle');
      container.classList.remove('modal-dragging');
    };
  }, [draggable, labelledBy]);

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
    <section ref={containerRef} className={className} role={role} aria-modal="true" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} tabIndex={-1} onKeyDown={onKeyDown} style={offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}>
      {as === 'form' ? <form className="dialog-form" onSubmit={onSubmit} onChangeCapture={onChangeCapture}>{children}</form> : children}
    </section>
  </div>;
}
