import { useMemo } from 'react';
import { buildDailyPrepSummary } from '../core/checklists/dailyPrepAggregation';
import './DailyPrepSummary.css';

function AffectedJobs({ jobs = [] }) {
  return <p className="daily-prep-affected"><strong>Jobs:</strong> {jobs.map(job => job.label).join(', ')}</p>;
}

function Empty({ children }) {
  return <p className="daily-prep-empty-copy">{children}</p>;
}

function Mixture({ entry }) {
  const { record, jobs } = entry;
  return (
    <article className="daily-prep-item">
      <h5>{record.name}</h5>
      <p><strong>Classification:</strong> Cleaning only</p>
      <p><strong>Status:</strong> {record.status === 'restricted' ? 'Restricted' : 'Approved'}</p>
      {record.status === 'restricted' && <p><strong>Restriction:</strong> {record.ownerReviewNotes || record.prohibitedSurfaces.join(', ')}</p>}
      {record.formulaVariants?.length > 0 ? record.formulaVariants.map(variant => (
        <div key={variant.id} className="daily-prep-formula">
          <strong>{variant.name} formula</strong>
          <p>{(variant.measurements || []).join(' + ')}</p>
          {variant.expectedYield && <p>Yield: {variant.expectedYield}</p>}
        </div>
      )) : record.measurements?.length > 0 && <p><strong>Formula:</strong> {record.measurements.join(' + ')}</p>}
      {record.intendedUses?.length > 0 && <p><strong>Intended use:</strong> {record.intendedUses.join(', ')}</p>}
      {record.approvedContainer && <p><strong>Container:</strong> {record.approvedContainer}</p>}
      {record.shelfLife && <p><strong>Shelf life:</strong> {record.shelfLife}</p>}
      {record.dwellTime && <p><strong>Dwell time:</strong> {record.dwellTime}</p>}
      <AffectedJobs jobs={jobs} />
    </article>
  );
}

function CommercialProduct({ entry }) {
  const { record, jobs } = entry;
  const identity = [record.brand, record.productName, record.variant, record.containerSize].filter(Boolean).join(' · ');
  return (
    <article className="daily-prep-item">
      <h5>{identity || record.name}</h5>
      {record.prohibitedSurfaces?.length > 0 && <p><strong>Restrictions:</strong> {record.prohibitedSurfaces.join(', ')}</p>}
      {record.status === 'restricted' && <p><strong>Restricted:</strong> {record.ownerReviewNotes || 'Owner review required before use.'}</p>}
      <AffectedJobs jobs={jobs} />
    </article>
  );
}

function RequirementList({ entries = [] }) {
  return entries.length ? <ul>{entries.map(entry => <li key={entry.label}>{entry.label}<AffectedJobs jobs={entry.jobs} /></li>)}</ul> : null;
}

export function DailyPrepSummary({ bookings = [], tenantId, tenantMethods = [], loading = false, error = '' }) {
  const summary = useMemo(
    () => buildDailyPrepSummary({ bookings, tenantId, tenantMethods }),
    [bookings, tenantId, tenantMethods],
  );

  return (
    <aside className="job-prep-summary daily-prep-summary" aria-labelledby="daily-prep-summary-title">
      <h3 id="daily-prep-summary-title">Daily prep summary</h3>
      <p>Prepare approved kits once, then review only the exceptions below. No quantities or inventory estimates are calculated.</p>
      {loading && <p role="status">Loading approved tenant methods...</p>}
      {error && <p role="alert" className="daily-prep-alert">{error}</p>}
      <section>
        <h4>Mix before leaving</h4>
        {summary.mixtures.length ? summary.mixtures.map(entry => <Mixture entry={entry} key={entry.id} />) : <Empty>No approved company mixtures are required by today’s ready packets.</Empty>}
      </section>
      <section>
        <h4>Commercial products</h4>
        {summary.commercialProducts.length ? summary.commercialProducts.map(entry => <CommercialProduct entry={entry} key={entry.id} />) : <Empty>No approved commercial products are required by today’s ready packets.</Empty>}
      </section>
      <section>
        <h4>Tools and equipment</h4>
        {summary.tools.length ? <RequirementList entries={summary.tools} /> : <Empty>No approved method-specific tools are recorded.</Empty>}
      </section>
      <section>
        <h4>PPE</h4>
        {summary.ppe.length ? <RequirementList entries={summary.ppe} /> : <Empty>No approved method-specific PPE is recorded.</Empty>}
      </section>
      <section>
        <h4>Surface and chemical warnings</h4>
        {summary.warnings.length ? <RequirementList entries={summary.warnings} /> : <Empty>No method-specific surface or chemical warnings are recorded.</Empty>}
      </section>
      <section className={summary.needsAttention.length ? 'daily-prep-needs-attention' : ''}>
        <h4>Needs attention</h4>
        {summary.needsAttention.length ? (
          <ul>{summary.needsAttention.map(item => <li key={item.key}><strong>{item.job.label}:</strong> {item.reason}</li>)}</ul>
        ) : <Empty>All scheduled jobs have approved current packets and usable saved methods where mapped.</Empty>}
      </section>
    </aside>
  );
}
