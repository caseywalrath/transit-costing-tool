import type { ReactNode } from 'react';
import { MenuButton, type MenuGroup } from '../MenuButton';
import { type HeaderStatus } from './headerStatus';

export type HeaderTab = { id: string; label: string; disabled?: boolean; title?: string };

/** Row 1 of the two-row header (H-B): application name, primary tabs, and the one-line status. */
function AppBar({ tabs, activeTab, onTab, status }: { tabs: HeaderTab[]; activeTab: string; onTab: (id: string) => void; status: HeaderStatus }) {
  return <header className="app-bar">
    <div className="app-bar__brand"><span className="app-bar__mark" aria-hidden="true" /><strong>Transit Costing Tool</strong></div>
    <nav aria-label="Primary">{tabs.map((tab) => <button key={tab.id} type="button" className={`tab ${activeTab === tab.id ? 'active' : ''}`} aria-current={activeTab === tab.id ? 'page' : undefined} disabled={tab.disabled} title={tab.title} onClick={() => onTab(tab.id)}>{tab.label}</button>)}</nav>
    <span className="app-bar__spacer" />
    <span className={`save-status save-status--${status.kind}`} role="status" aria-live="polite"><span className="save-status__dot" aria-hidden="true" />{status.text}{status.backup && <span className={status.backup.stale ? 'save-status__backup save-status__backup--stale' : 'save-status__backup'}> · {status.backup.text}</span>}</span>
  </header>;
}

/**
 * Project or Scenario switcher: a menu button whose trigger shows a caption and the current name. The caption is hidden on narrow
 * windows (it stays in the accessible name). The menu lists the choices as radio items, then the actions on the current item.
 */
export function Switcher({ kind, name, groups, disabled }: { kind: 'Project' | 'Scenario'; name: string; groups: MenuGroup[]; disabled?: boolean }) {
  return <MenuButton label={name || `Select ${kind.toLowerCase()}`} triggerAriaLabel={`${kind}: ${name || 'none selected'}`} menuLabel={`${kind} actions`} groups={groups} disabled={disabled} menuAlign="start"
    triggerClassName={`switcher switcher--${kind.toLowerCase()}`} triggerContent={<><small className="switcher__caption">{kind}</small><span className="switcher__name">{name || `Select ${kind.toLowerCase()}`}</span></>} />;
}

/**
 * The application header. Row 1 is the app bar. Row 2 is the scope bar: the Project and Scenario switchers, a divider, then the active
 * tab's scope selectors. `scopeFields` are rendered by the shell (Route and Trips); `scopeSlotRef` receives the element that Blocking and
 * Costing render their own selectors into through a portal. Row 2 never wraps.
 */
export function AppHeader({ tabs, activeTab, onTab, status, projectSwitcher, scenarioSwitcher, scopeFields, scopeSlotRef }: {
  tabs: HeaderTab[]; activeTab: string; onTab: (id: string) => void; status: HeaderStatus; projectSwitcher: ReactNode; scenarioSwitcher: ReactNode; scopeFields?: ReactNode; scopeSlotRef: (element: HTMLElement | null) => void;
}) {
  return <div className="app-header">
    <AppBar tabs={tabs} activeTab={activeTab} onTab={onTab} status={status} />
    <section className="scope-bar" aria-label="Scope">
      <div className="scope-switchers">{projectSwitcher}<span className="scope-switchers__sep" aria-hidden="true">›</span>{scenarioSwitcher}</div>
      <span className="scope-bar__divider" aria-hidden="true" />
      {scopeFields && <div className="scope-bar__slot">{scopeFields}</div>}
      <div className="scope-bar__slot" ref={scopeSlotRef} />
    </section>
  </div>;
}
