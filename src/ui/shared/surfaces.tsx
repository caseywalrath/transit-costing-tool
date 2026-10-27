import type { ReactNode, Ref } from 'react';

/**
 * Level 1: the panel the planner works in. One primary action at most, in `actions`. `titleRef` makes the title focusable by script;
 * `badge` sits beside the title; `context` holds the labelled selectors that set what the panel shows, between the count and the actions.
 */
export function WorkSurface({ title, titleRef, count, badge, context, subtitle, actions, footer, ariaLabel, className, children }: { title: string; titleRef?: Ref<HTMLHeadingElement>; count?: number; badge?: ReactNode; context?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; footer?: ReactNode; ariaLabel?: string; className?: string; children: ReactNode }) {
  return <section className={['work-surface', className].filter(Boolean).join(' ')} aria-label={ariaLabel}>
    <header className="work-surface__header">
      <h2 className="work-surface__title" ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</h2>
      {count !== undefined && <span className="work-surface__count">{count}</span>}
      {badge}
      {context && <div className="work-surface__context">{context}</div>}
      {subtitle && <span className="work-surface__subtitle">{subtitle}</span>}
      {actions && <div className="work-surface__actions">{actions}</div>}
    </header>
    <div className="work-surface__body">{children}</div>
    {footer}
  </section>;
}

/** Level 2: context and summaries. No card border. */
export function SupportPanel({ title, aside, ariaLabel, children }: { title: string; aside?: ReactNode; ariaLabel?: string; children: ReactNode }) {
  return <section className="support-panel" aria-label={ariaLabel}>
    <div className="support-panel__header"><h3 className="support-panel__title">{title}</h3>{aside}</div>
    <div className="support-panel__body">{children}</div>
  </section>;
}

/** Level 3: one line of status or guidance. */
export function InlineNote({ kind = 'info', children, live = false }: { kind?: 'info' | 'warn' | 'ok'; children: ReactNode; live?: boolean }) {
  return <p className={`inline-note inline-note--${kind}`} role={live ? 'status' : undefined}><span className="inline-note__icon" aria-hidden="true">{kind === 'warn' ? '!' : kind === 'ok' ? '✓' : 'i'}</span><span>{children}</span></p>;
}
