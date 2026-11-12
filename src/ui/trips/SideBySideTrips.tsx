import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { DEFAULT_VIEW_OPTIONS, TripsWorkspace, type TripViewOptions } from './TripsWorkspace';
import type { RouteNavigationGuard } from '../shared/types';

type WorkspaceProps = ComponentProps<typeof TripsWorkspace>;
type Side = 'left' | 'right';
type DirectionChoice = { id: string; name: string };

/** What the app tells the Trips tab about side by side (Decision 0060). `ids` is set while two panes are shown. */
export type SideBySideControl = {
  ids?: [string, string];
  directions: DirectionChoice[];
  /** Why side by side cannot be turned on now (one direction, a narrow window). */
  disabledReason?: string;
  onTurnOn: () => void;
  onClose: () => void;
  onChooseSides: (leftDirectionId: string, rightDirectionId: string) => void;
};

/** Decision 0060 item 12: side by side is offered only in a window at least this wide. */
const MINIMUM_QUERY = '(min-width: 1100px)';

/** True while the window is wide enough for side by side. False where `matchMedia` is missing. */
export function useSideBySideWidth() {
  const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(MINIMUM_QUERY) : undefined;
  const [wide, setWide] = useState(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}

type HostProps = Omit<WorkspaceProps, 'sideBySideMenu'> & { sideBySide?: SideBySideControl };

/** The Trips tab body: today's single workspace, whose View menu can turn side by side on, or two panes while `sideBySide.ids` is set. */
export function TripsOrSideBySide({ sideBySide, ...props }: HostProps) {
  if (!sideBySide?.ids) return <TripsWorkspace {...props} sideBySideMenu={sideBySide ? { checked: false, disabledReason: sideBySide.disabledReason, onToggle: sideBySide.onTurnOn } : undefined} />;
  const { directionId: _single, ...shared } = props;
  return <SideBySideTrips {...shared} control={sideBySide} leftDirectionId={sideBySide.ids[0]} rightDirectionId={sideBySide.ids[1]} />;
}

type ContainerProps = Omit<WorkspaceProps, 'directionId' | 'pane' | 'sharedControls' | 'blockingScenarioId' | 'onBlockingScenarioChange' | 'blockingScenarioListVersion' | 'onBlockingScenarioListChanged' | 'onBeforeOpenEdit' | 'onOpenEditChange' | 'yieldToken' | 'sharedSlots' | 'viewOptions' | 'onViewOptionsChange' | 'sideBySideMenu' | 'paneContext'>
  & { leftDirectionId: string; rightDirectionId: string; control: SideBySideControl };

/**
 * Two Trips workspaces for two directions (Decision 0060). The container draws the shared Trips header and the side-by-side strip, and settles
 * what the panes share or must not do at once: one navigation guard for the app (each pane answers for its own open edit), one blocking scenario,
 * one set of View options, and the rule that only one pane holds an open edit (an Add-trip row, a staged Shift, or the Build trips drawer).
 * The left pane draws the shared header controls into this header's slots, because they act on its own state.
 */
export function SideBySideTrips({ leftDirectionId, rightDirectionId, control, onRegisterNavigationGuard, ...shared }: ContainerProps) {
  const guards = useRef<Record<Side, RouteNavigationGuard | undefined>>({ left: undefined, right: undefined });
  const registerApp = useRef(onRegisterNavigationGuard);
  registerApp.current = onRegisterNavigationGuard;
  const [blockingScenarioId, setBlockingScenarioId] = useState('');
  // Counted by the container, so both panes reload the Blocking Scenario list after a New, Duplicate, Rename, or Delete in either pane's shared header.
  const [blockingScenarioListVersion, setBlockingScenarioListVersion] = useState(0);
  const [viewOptions, setViewOptions] = useState<TripViewOptions>(DEFAULT_VIEW_OPTIONS);
  // Counted by direction, so Switch sides does not look like a request to yield.
  const [yieldTokens, setYieldTokens] = useState<Record<string, number>>({});
  const [contextSlot, setContextSlot] = useState<HTMLDivElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  // Guards are kept by direction, not by side, so Switch sides (which keeps both panes mounted) keeps each pane's guard with it.
  const sideOf = (directionId: string): Side => directionId === leftDirectionId ? 'left' : 'right';
  const guardsByDirection = useRef<Record<string, RouteNavigationGuard | undefined>>({});
  const leftDirectionIdRef = useRef(leftDirectionId); leftDirectionIdRef.current = leftDirectionId;
  const rightDirectionIdRef = useRef(rightDirectionId); rightDirectionIdRef.current = rightDirectionId;
  const syncGuards = () => { guards.current = { left: guardsByDirection.current[leftDirectionIdRef.current], right: guardsByDirection.current[rightDirectionIdRef.current] }; };
  syncGuards();

  // The app's one guard asks the left pane's question, then the right pane's, and runs the action once both allow it.
  const combinedGuard = useCallback<RouteNavigationGuard>((action) => {
    const { left, right } = guards.current;
    const afterLeft = () => { if (right) right(action); else action(); };
    if (left) left(afterLeft); else afterLeft();
  }, []);
  const registerGuard = useCallback((directionId: string) => (guard: RouteNavigationGuard | undefined) => {
    guardsByDirection.current[directionId] = guard;
    syncGuards();
    registerApp.current(guards.current.left || guards.current.right ? combinedGuard : undefined);
  }, [combinedGuard]);
  const registerByDirection = useMemo(() => new Map<string, (guard: RouteNavigationGuard | undefined) => void>(), []);
  const registerFor = (directionId: string) => { let register = registerByDirection.get(directionId); if (!register) { register = registerGuard(directionId); registerByDirection.set(directionId, register); } return register; };

  // Before a pane starts an open edit, the other pane settles its own: its guard asks about an Add-trip row or staged Shift, and its Build drawer closes.
  const beforeOpenEdit = useCallback((directionId: string) => (start: () => void) => {
    const other: Side = sideOf(directionId) === 'left' ? 'right' : 'left';
    const otherDirectionId = other === 'left' ? leftDirectionId : rightDirectionId;
    const proceed = () => { setYieldTokens((current) => ({ ...current, [otherDirectionId]: (current[otherDirectionId] ?? 0) + 1 })); start(); };
    const otherGuard = guards.current[other];
    if (otherGuard) otherGuard(proceed); else proceed();
  }, [leftDirectionId, rightDirectionId]);

  const requestClose = () => combinedGuard(control.onClose);
  const nameOf = (directionId: string) => control.directions.find((direction) => direction.id === directionId)?.name ?? 'Direction';
  // More than two directions (Decision 0060 item 4): each pane chooses its own; choosing the other pane's direction swaps the panes.
  // A pane that changes direction is drawn again, so its own open edit is asked about first.
  const choose = (side: Side, next: string) => {
    const [left, right] = side === 'left' ? [next, next === rightDirectionId ? leftDirectionId : rightDirectionId] : [next === leftDirectionId ? rightDirectionId : leftDirectionId, next];
    const leaving = guards.current[side];
    if (leaving && next !== leftDirectionId && next !== rightDirectionId) leaving(() => control.onChooseSides(left, right));
    else control.onChooseSides(left, right);
  };
  const picker = (side: Side, value: string) => control.directions.length > 2
    ? <select className="segmented-fallback" aria-label={side === 'left' ? 'Left direction' : 'Right direction'} value={value} onChange={(event) => choose(side, event.target.value)}>{control.directions.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select>
    : undefined;

  const pane = (side: Side, directionId: string) => <TripsWorkspace {...shared} key={directionId} directionId={directionId} pane={{ side }} sharedControls={side === 'left'}
    sharedSlots={side === 'left' ? { context: contextSlot, actions: actionsSlot } : undefined}
    blockingScenarioId={blockingScenarioId} onBlockingScenarioChange={setBlockingScenarioId}
    blockingScenarioListVersion={blockingScenarioListVersion} onBlockingScenarioListChanged={() => setBlockingScenarioListVersion((version) => version + 1)}
    viewOptions={viewOptions} onViewOptionsChange={setViewOptions}
    sideBySideMenu={{ checked: true, onToggle: requestClose }} paneContext={picker(side, directionId)}
    onRegisterNavigationGuard={registerFor(directionId)} onBeforeOpenEdit={beforeOpenEdit(directionId)} yieldToken={yieldTokens[directionId] ?? 0} />;
  // Each pane is keyed by its direction, so Switch sides moves the two panes without drawing them again: open edits and scroll positions stay.
  return <div className="trips-workspace side-by-side-trips">
    <h1 className="visually-hidden">Trips, both directions</h1>
    <section className="work-surface trips-surface side-by-side-surface" aria-label="Trips, both directions">
      <header className="work-surface__header">
        <h2 className="work-surface__title">Trips</h2>
        <div className="work-surface__context" ref={setContextSlot} />
        <div className="work-surface__actions" ref={setActionsSlot} />
      </header>
      <div className="side-by-side-strip" role="group" aria-label="Side by side">
        <span className="side-by-side-strip__text">{nameOf(leftDirectionId)} on the left · {nameOf(rightDirectionId)} on the right</span>
        <button type="button" onClick={() => control.onChooseSides(rightDirectionId, leftDirectionId)}><span aria-hidden="true">⇄ </span>Switch sides</button>
        <span className="grow" />
        <button type="button" onClick={requestClose}><span aria-hidden="true">✕ </span>Close side by side</button>
      </div>
      <div className="side-by-side-panes">
        {[leftDirectionId, rightDirectionId].map((directionId) => <div key={directionId} className="side-by-side-pane">{pane(sideOf(directionId), directionId)}</div>)}
      </div>
    </section>
  </div>;
}
