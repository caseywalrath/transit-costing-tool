// The CSV text rules live in `src/persistence/csv.ts` with the serializers. The interface layer reads them from here, because
// `src/ui` must not import from `src/persistence` (review finding 4-013, decision 12).
export { csvEscape, neutralizeFormulaText, restoreFormulaText } from '../persistence/csv';
