import type { ReactNode } from 'react';
import { INCOMPLETE } from '../format';

/** Renders a formatted figure; "Incomplete" takes the warning style (plan Appendix C, F7-A). */
export function figure(text: string): ReactNode {
  return text === INCOMPLETE ? <span className="value-incomplete">{text}</span> : text;
}
