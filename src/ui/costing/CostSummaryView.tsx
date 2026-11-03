import { createPortal } from 'react-dom';
import type { CostSummary } from '../../domain/costSummary';
import { ModalDialog } from '../ModalDialog';
import { formatHours, formatMoney, formatPercent, MISSING } from '../format';

const money = (value: number | undefined) => value === undefined ? MISSING : formatMoney(value);
const millions = (value: number) => `$${(value / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
const daily = (value: number | undefined) => value === undefined ? MISSING : formatHours(value, 'daily');
const annual = (value: number | undefined) => value === undefined ? MISSING : formatHours(value, 'annual');

function preparedText(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Decision 0054. The Operating Cost Estimate: one printable page for readers outside the app. It is drawn over the whole window and
 * the print stylesheet prints only this sheet, so the browser's "Save as PDF" produces the page.
 */
export function CostSummaryView({ summary, onClose }: { summary: CostSummary; onClose: () => void }) {
  const totalDays = summary.days.reduce((sum, day) => sum + day.annualServiceDays, 0);
  return createPortal(<ModalDialog labelledBy="cost-summary-title" className="cost-summary-dialog" onClose={onClose}>
    <div className="cost-summary-toolbar">
      <button type="button" onClick={onClose}>Close</button>
      <button type="button" className="primary" onClick={() => window.print()}>Print or save as PDF</button>
    </div>
    <article className="cost-summary-sheet">
      <header className="cost-summary-header">
        <div><p className="cost-summary-eyebrow">{summary.projectName}</p><h2 id="cost-summary-title">Operating Cost Estimate</h2></div>
        <p className="cost-summary-meta">Scenario: {summary.scenarioName}<br />Prepared {preparedText(summary.preparedOn)}</p>
      </header>
      <dl className="cost-summary-figures">
        <div><dt>{summary.firstYear} annual cost</dt><dd>{millions(summary.firstYearCostUsd)}</dd></div>
        {summary.futureYearCount > 0 && <div><dt>Year {summary.futureYearCount} cost</dt><dd>{millions(summary.lastYearCostUsd)}</dd></div>}
        <div><dt>{summary.firstYear} revenue hours</dt><dd>{annual(summary.annualRevenueHours)}</dd></div>
        <div><dt>{summary.firstYear} platform hours</dt><dd>{annual(summary.annualPlatformHours)}</dd></div>
      </dl>
      <section aria-labelledby="cost-summary-days">
        <h3 id="cost-summary-days" className="cost-summary-section">Service by day · {summary.firstYear}</h3>
        <table className="cost-summary-table">
          <thead><tr><th scope="col">Service day</th><th scope="col">Days / year</th><th scope="col">Daily revenue hours</th><th scope="col">Daily platform hours</th><th scope="col">Annual revenue hours</th><th scope="col">{summary.firstYear} annual cost</th></tr></thead>
          <tbody>{summary.days.map((day) => <tr key={day.serviceDayId}><th scope="row">{day.name}</th><td>{day.annualServiceDays}</td><td>{daily(day.revenueHoursPerDay)}</td><td>{daily(day.platformHoursPerDay)}</td><td>{annual(day.annualRevenueHours)}</td><td>{money(day.firstYearCostUsd)}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row">Total</th><td>{totalDays}</td><td></td><td></td><td>{annual(summary.annualRevenueHours)}</td><td>{money(summary.firstYearCostUsd)}</td></tr></tfoot>
        </table>
      </section>
      <section aria-labelledby="cost-summary-years">
        <h3 id="cost-summary-years" className="cost-summary-section">Cost by year</h3>
        <table className="cost-summary-table">
          <thead><tr><th scope="col">Year</th><th scope="col">$ per revenue hour</th><th scope="col">Annual cost</th><th scope="col">Cumulative cost</th></tr></thead>
          <tbody>{summary.years.map((year) => <tr key={year.serviceYear}><th scope="row">{year.serviceYear}</th><td>{formatMoney(year.appliedRateUsdPerRevenueHour, { cents: true })}</td><td>{formatMoney(year.annualCostUsd)}</td><td>{formatMoney(year.cumulativeCostUsd)}</td></tr>)}</tbody>
        </table>
      </section>
      <footer className="cost-summary-footer">Costs are based on annual revenue hours and {formatPercent(summary.annualEscalation * 100)} projected inflation.</footer>
    </article>
  </ModalDialog>, document.body);
}
