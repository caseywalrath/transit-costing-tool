import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { TripsWorkspace } from './TripsWorkspace';
import type { RouteNavigationGuard } from '../shared/types';

type WorkspaceProps = ComponentProps<typeof TripsWorkspace>;
type Side = 'left' | 'right';

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

/** The Trips tab body: today's single workspace, or two panes when `sideBySide` names the left and right directions. */
export function TripsOrSideBySide({ sideBySide, ...props }: WorkspaceProps & { sideBySide?: [string, string] }) {
  if (!sideBySide) return <TripsWorkspace {...props} />;
  const { directionId: _single, ...shared } = props;
  return <SideBySideTrips {...shared} leftDirectionId={sideBySide[0]} rightDirectionId={sideBySide[1]} />;
}

/**
 * Two Trips workspaces for two directions (Decision 0060). The container owns what the panes share and settles what they must not do at once:
 * one navigation guard for the app (each pane answers for its own open edit), one blocking scenario, and the rule that only one pane holds an
 * open edit (an Add-trip row, a staged Shift, or the Build trips drawer). It adds no styling of its own; the side-by-side layout is package SS3.
 */
export function SideBySideTrips({ leftDirectionId, rightDirectionId, onRegisterNavigationGuard, ...shared }: Omit<WorkspaceProps, 'directionId' | 'pane' | 'sharedControls' | 'blockingScenarioId' | 'onBlockingScenarioChange' | 'onBeforeOpenEdit' | 'onOpenEditChange' | 'yieldToken'> & { leftDirectionId: string; rightDirectionId: string }) {
  const guards = useRef<Record<Side, RouteNavigationGuard | undefined>>({ left: undefined, right: undefined });
  const registerApp = useRef(onRegisterNavigationGuard);
  registerApp.current = onRegisterNavigationGuard;
  const [blockingScenarioId, setBlockingScenarioId] = useState('');
  const [yieldTokens, setYieldTokens] = useState<Record<Side, number>>({ left: 0, right: 0 });

  // The app's one guard asks the left pane's question, then the right pane's, and runs the action once both allow it.
  const combinedGuard = useCallback<RouteNavigationGuard>((action) => {
    const { left, right } = guards.current;
    const afterLeft = () => { if (right) right(action); else action(); };
    if (left) left(afterLeft); else afterLeft();
  }, []);
  const registerGuard = useMemo(() => {
    const make = (side: Side) => (guard: RouteNavigationGuard | undefined) => {
      guards.current[side] = guard;
      registerApp.current(guards.current.left || guards.current.right ? combinedGuard : undefined);
    };
    return { left: make('left'), right: make('right') };
  }, [combinedGuard]);

  // Before a pane starts an open edit, the other pane settles its own: its guard asks about an Add-trip row or staged Shift, and its Build drawer closes.
  const beforeOpenEdit = useMemo(() => {
    const make = (side: Side) => (start: () => void) => {
      const other: Side = side === 'left' ? 'right' : 'left';
      const proceed = () => { setYieldTokens((current) => ({ ...current, [other]: current[other] + 1 })); start(); };
      const otherGuard = guards.current[other];
      if (otherGuard) otherGuard(proceed); else proceed();
    };
    return { left: make('left'), right: make('right') };
  }, []);

  const pane = (side: Side, directionId: string) => <TripsWorkspace {...shared} key={directionId} directionId={directionId} pane={{ side }} sharedControls={side === 'left'}
    blockingScenarioId={blockingScenarioId} onBlockingScenarioChange={setBlockingScenarioId}
    onRegisterNavigationGuard={registerGuard[side]} onBeforeOpenEdit={beforeOpenEdit[side]} yieldToken={yieldTokens[side]} />;
  return <div className="side-by-side-trips">
    {pane('left', leftDirectionId)}
    {pane('right', rightDirectionId)}
  </div>;
}
