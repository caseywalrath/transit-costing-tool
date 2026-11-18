import type { ReactNode } from 'react';
import { MenuButton, type MenuGroup } from '../MenuButton';
import { blockColorToken } from '../shared/chips';
import { BrandMark } from './BrandMark';
import { type HeaderStatus } from './headerStatus';

export type HeaderTab = { id: string; label: string; disabled?: boolean; title?: string };

/** Row 1 of the two-row header (H-B): application name, primary tabs, and the one-line status. */
function AppBar({ tabs, activeTab, onTab, status }: { tabs: HeaderTab[]; activeTab: string; onTab: (id: string) => void; status: HeaderStatus }) {
  return <header className="app-bar">
    <div className="app-bar__brand"><BrandMark /><strong>Transit Costing Tool</strong></div>
    <nav aria-label="Primary">{tabs.map((tab) => <button key={tab.id} type="button" className={`tab ${activeTab === tab.id ? 'active' : ''}`} aria-current={activeTab === tab.id ? 'page' : undefined} disabled={tab.disabled} title={tab.title} onClick={() => onTab(tab.id)}>{tab.label}</button>)}</nav>
    <span className="app-bar__spacer" />
    <span className={`save-status save-status--${status.kind}`} role="status" aria-live="polite"><span className="save-status__dot" aria-hidden="true" />{status.text}{status.backup && <span className={status.backup.stale ? 'save-status__backup save-status__backup--stale' : 'save-status__backup'}> · {status.backup.text}</span>}</span>
  </header>;
}

/**
 * Project or Scenario switcher: a menu button whose trigger shows a caption and the current name. The caption is hidden on narrow
 * windows (it stays in the accessible name). The menu lists the choices as radio items, then the actions on the current item.
 */
export function Switcher({ kind, name, groups, disabled, identity, emptyName }: { kind: 'Project' | 'Scenario' | 'Trip profile' | 'Blocking scenario'; name: string; groups: MenuGroup[]; disabled?: boolean; identity?: boolean; emptyName?: string }) {
  const shown = name || emptyName || `Select ${kind.toLowerCase()}`;
  const modifier = kind.toLowerCase().replace(' ', '-');
  return <MenuButton label={shown} triggerAriaLabel={`${kind}: ${name || emptyName || 'none selected'}`} menuLabel={`${kind} actions`} groups={groups} disabled={disabled} menuAlign="start"
    triggerClassName={`switcher switcher--${modifier}`} triggerContent={<><small className="switcher__caption">{kind}</small>{identity && name && <IdentityDot name={name} />}<span className="switcher__name">{shown}</span></>} />;
}

/** Decision 0081 (D7): a colour dot for a context level with two or more choices, from the name's hash. The name always shows beside it. */
export function IdentityDot({ name }: { name: string }) {
  return <span className="identity-dot" aria-hidden="true" style={{ backgroundColor: `var(${blockColorToken(name)})` }} />;
}

/** The separator and switcher of one breadcrumb level after the Scenario (Decision 0081, D6). */
export function ContextCrumb({ children }: { children: ReactNode }) {
  return <><span className="scope-switchers__sep" aria-hidden="true">›</span>{children}</>;
}

/**
 * The application header. Row 1 is the app bar. Row 2 is the scope bar: the Project and Scenario switchers, a divider, then the active
 * tab's scope selectors. `scopeFields` are rendered by the shell (Route and Trips); `scopeSlotRef` receives the element that Blocking and
 * Costing render their own selectors into through a portal. Row 2 never wraps.
 */
export function AppHeader({ tabs, activeTab, onTab, status, projectSwitcher, scenarioSwitcher, contextCrumbs, crumbSlotRef, scopeFields, scopeSlotRef }: {
  tabs: HeaderTab[]; activeTab: string; onTab: (id: string) => void; status: HeaderStatus; projectSwitcher: ReactNode; scenarioSwitcher: ReactNode;
  /** The Trip profile and Blocking scenario levels the shell draws (Decision 0081, D6). */
  contextCrumbs?: ReactNode;
  /** Receives the element a workspace draws its own Blocking scenario level into, after `contextCrumbs`. */
  crumbSlotRef?: (element: HTMLElement | null) => void;
  scopeFields?: ReactNode; scopeSlotRef: (element: HTMLElement | null) => void;
}) {
  return <div className="app-header">
    <AppBar tabs={tabs} activeTab={activeTab} onTab={onTab} status={status} />
    <section className="scope-bar" aria-label="Scope">
      <div className="scope-switchers">{projectSwitcher}<span className="scope-switchers__sep" aria-hidden="true">›</span>{scenarioSwitcher}{contextCrumbs}<span className="scope-switchers__slot" ref={crumbSlotRef} /></div>
      <span className="scope-bar__divider" aria-hidden="true" />
      {scopeFields && <div className="scope-bar__slot">{scopeFields}</div>}
      <div className="scope-bar__slot" ref={scopeSlotRef} />
    </section>
  </div>;
}
