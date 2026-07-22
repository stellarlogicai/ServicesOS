const STATUS_LABELS = {
  approved: 'Approved',
  restricted: 'Restricted',
};

function MethodInstructions({ record }) {
  const exactProduct = record.recordType === 'commercial_product'
    ? [record.brand, record.productName, record.variant, record.containerSize].filter(Boolean).join(' · ')
    : '';
  return (
    <div className="checklist-method-instructions">
      <p><strong>Classification:</strong> {record.classification === 'cleaning' ? 'Cleaning only' : record.classification}</p>
      <p><strong>Status:</strong> {STATUS_LABELS[record.status] || record.status}</p>
      {record.status === 'restricted' && <p><strong>Restrictions:</strong> {record.ownerReviewNotes || record.prohibitedSurfaces.join(', ')}</p>}
      {exactProduct && <p><strong>Exact product:</strong> {exactProduct}</p>}
      {record.formulaVariants?.length > 0 && record.formulaVariants.map(variant => (
        <div key={variant.id}>
          <strong>{variant.name} formula</strong>
          <ul>{(variant.measurements || []).map(value => <li key={value}>{value}</li>)}</ul>
          {variant.expectedYield && <p>Yield: {variant.expectedYield}</p>}
        </div>
      ))}
      {record.measurements?.length > 0 && <p><strong>Formula:</strong> {record.measurements.join(' + ')}</p>}
      {record.intendedUses?.length > 0 && <p><strong>Intended use:</strong> {record.intendedUses.join(', ')}</p>}
      {record.compatibleSurfaces?.length > 0 && <p><strong>Compatible surfaces:</strong> {record.compatibleSurfaces.join(', ')}</p>}
      {record.prohibitedSurfaces?.length > 0 && <p className="checklist-method-warning"><strong>Do not use on:</strong> {record.prohibitedSurfaces.join(', ')}</p>}
      {record.requiredPPE?.length > 0 && <p><strong>PPE:</strong> {record.requiredPPE.join(', ')}</p>}
      {record.requiredTools?.length > 0 && <p><strong>Tools:</strong> {record.requiredTools.join(', ')}</p>}
      {(record.dwellTime || record.contactTime) && <p><strong>Dwell/contact time:</strong> {record.dwellTime || record.contactTime}</p>}
      {record.mixingOrder?.length > 0 && (
        <div><strong>Preparation</strong><ol>{record.mixingOrder.map(step => <li key={step}>{step}</li>)}</ol></div>
      )}
      {(record.applicationInstructions || record.labelDirections) && <p><strong>Application:</strong> {record.applicationInstructions || record.labelDirections}</p>}
      {record.rinseInstructions && <p><strong>Rinse:</strong> {record.rinseInstructions}</p>}
      {record.dryingInstructions && <p><strong>Drying:</strong> {record.dryingInstructions}</p>}
      {record.dangerousCombinations?.length > 0 && (
        <div className="checklist-method-warning"><strong>Dangerous combinations</strong><ul>{record.dangerousCombinations.map(value => <li key={value}>{value}</li>)}</ul></div>
      )}
    </div>
  );
}

export function OwnerChecklistMethodGuidance({ guidance }) {
  if (!guidance?.mapping) return null;
  return (
    <div className="checklist-method-review">
      <strong>Cleaning method</strong>
      {guidance.preferred ? (
        <details>
          <summary>Preferred: {guidance.preferred.name}</summary>
          <MethodInstructions record={guidance.preferred} />
        </details>
      ) : <p>No approved preferred method is available.</p>}
      {guidance.alternatives.length > 0 && (
        <div>
          <span>Approved alternatives</span>
          <ul>{guidance.alternatives.map(record => <li key={record.id}>{record.name}</li>)}</ul>
        </div>
      )}
      {guidance.warnings.length > 0 && (
        <div className="checklist-method-warning">
          <strong>Method unavailable</strong>
          <ul>{guidance.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function FieldChecklistMethodGuidance({ records = [], preferredMethodId }) {
  if (records.length === 0) return null;
  const preferred = records.find(record => record.id === preferredMethodId) || records[0];
  const alternatives = records.filter(record => record.id !== preferred.id);
  return (
    <details className="field-job-checklist-method">
      <summary>View method</summary>
      <h6>{preferred.name}</h6>
      <MethodInstructions record={preferred} />
      {alternatives.length > 0 && <p><strong>Approved alternatives:</strong> {alternatives.map(record => record.name).join(', ')}</p>}
    </details>
  );
}
