import type { Node, RoutePattern } from '../domain/types';

// Short names for the Trips and Blocking tables. A planner-entered short name always wins; otherwise one is generated from the full name.
// Generated names are shown only; they are never stored, so a later change to the full name changes them too.

/** Words shortened when they are not the first word of a place name ("Wagon Road" → "Wagon Rd", but "Road Runner" stays). */
const PLACE_WORD_ABBREVIATIONS: Record<string, string> = {
  avenue: 'Ave', boulevard: 'Blvd', center: 'Ctr', centre: 'Ctr', court: 'Ct', drive: 'Dr', heights: 'Hts', highway: 'Hwy', junction: 'Jct',
  lane: 'Ln', parkway: 'Pkwy', place: 'Pl', road: 'Rd', square: 'Sq', station: 'Sta', street: 'St', terrace: 'Ter',
};

const DIRECTION_ABBREVIATIONS: Record<string, string> = {
  northbound: 'NB', southbound: 'SB', eastbound: 'EB', westbound: 'WB', inbound: 'IB', outbound: 'OB',
  clockwise: 'CW', counterclockwise: 'CCW', 'counter-clockwise': 'CCW', anticlockwise: 'CCW',
};

/** Shortens the common street and place words of a name. Returns the name unchanged when nothing applies. */
export function abbreviatePlaceName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.map((word, index) => (index > 0 && PLACE_WORD_ABBREVIATIONS[word.toLowerCase()]) || word).join(' ');
}

/** "Northbound" → "NB"; a name of two or more words → its initials; any other name is returned as it is. */
export function directionAbbreviation(directionName: string | undefined): string {
  const name = directionName?.trim() ?? '';
  if (!name) return '';
  const known = DIRECTION_ABBREVIATIONS[name.toLowerCase()];
  if (known) return known;
  const words = name.split(/\s+/);
  return words.length > 1 ? words.slice(0, 3).map((word) => word[0].toUpperCase()).join('') : name;
}

/** The Node's short name, or its name with street and place words shortened. */
export function nodeShortName(node: Pick<Node, 'name' | 'shortName'> | undefined): string {
  if (!node) return '';
  return node.shortName?.trim() || abbreviatePlaceName(node.name);
}

/**
 * The name generated for a Pattern without a planner-entered short name: the direction abbreviation, then the full name without its
 * "<Direction>:" prefix. A name of the form "<origin> to <destination>" becomes "<origin>–<destination>"; an origin or destination that
 * names one of the Pattern's end Nodes uses that Node's short name, and any other part has its street and place words shortened.
 * "Northbound: Evans to Wagon Road" → "NB Evans–Wagon Rd".
 */
export function generatedPatternShortName(pattern: Pick<RoutePattern, 'name' | 'points'>, directionName: string | undefined, nodes?: ReadonlyMap<string, Pick<Node, 'name' | 'shortName'>>): string {
  let body = pattern.name.trim();
  const prefix = directionName?.trim() ? `${directionName.trim()}:` : '';
  if (prefix && body.toLowerCase().startsWith(prefix.toLowerCase()) && body.length > prefix.length) body = body.slice(prefix.length).trim();
  const endNodes = [pattern.points[0], pattern.points.at(-1)].map((point) => (point ? nodes?.get(point.nodeId) : undefined)).filter((node): node is Pick<Node, 'name' | 'shortName'> => Boolean(node));
  const shortenPart = (part: string) => {
    const endNode = endNodes.find((node) => node.name.trim().toLowerCase() === part.trim().toLowerCase());
    return endNode ? nodeShortName(endNode) : abbreviatePlaceName(part);
  };
  const parts = body.split(/\s+to\s+/i);
  const shortBody = parts.length === 2 && parts[0].trim() && parts[1].trim() ? `${shortenPart(parts[0])}–${shortenPart(parts[1])}` : abbreviatePlaceName(body);
  const direction = directionAbbreviation(directionName);
  return [direction, shortBody].filter(Boolean).join(' ') || 'Unnamed pattern';
}

/** The text of a Pattern chip or pill: the planner's short name (`directionLabel`), else the generated one. */
export function patternShortName(pattern: Pick<RoutePattern, 'name' | 'directionLabel' | 'points'> | undefined, directionName: string | undefined, nodes?: ReadonlyMap<string, Pick<Node, 'name' | 'shortName'>>): string {
  if (!pattern) return 'Unnamed pattern';
  return pattern.directionLabel?.trim() || generatedPatternShortName(pattern, directionName, nodes);
}
