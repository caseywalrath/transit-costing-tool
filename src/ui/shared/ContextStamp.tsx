import { IdentityDot } from '../shell/AppHeader';

/** One context level a dialog names: its kind, its name, and whether that level has two or more choices (then it has a dot). */
export type ContextLevel = { kind: string; name: string; several?: boolean };

/**
 * Decision 0081 (rule N3): one line at the top of a dialog whose effect reaches beyond the visible table, naming the context it acts in,
 * with the same identity dots as the scope bar. Levels without a name are left out.
 */
export function ContextStamp({ levels }: { levels: ContextLevel[] }) {
  const shown = levels.filter((level) => level.name);
  if (!shown.length) return null;
  return <p className="context-stamp">{shown.map((level, index) => <span key={level.kind} className="context-stamp__level">
    {index > 0 && <span className="context-stamp__sep" aria-hidden="true">›</span>}
    <span className="visually-hidden">{level.kind}: </span>{level.several && <IdentityDot name={level.name} />}{level.name}
  </span>)}</p>;
}
