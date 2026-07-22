import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adoptSystemDefaultMethod,
  createTenantCommercialProduct,
  listTenantCleaningRecords,
  reviewTenantCleaningRecord,
  updateTenantCommercialProduct,
} from '../modules/cleaning/products/cleaningProductService';
import { getCleaningRecordApprovalIssues } from '../modules/cleaning/products/cleaningProductModel';
import { getStarterCleaningMethods } from '../modules/cleaning/products/starterCleaningMethods';
import './CleaningProductsMethodsSection.css';

const INITIAL_FORM = {
  brand: '',
  productName: '',
  variant: '',
  manufacturer: '',
  containerSize: '',
  productCategory: '',
  classification: 'cleaning',
  donatedProduct: false,
  containerCondition: 'unknown',
  labelInformationComplete: false,
  intendedUses: '',
  compatibleSurfaces: '',
  prohibitedSurfaces: '',
  labelDirections: '',
  requiresDilution: false,
  dilutionInstructions: '',
  contactTime: '',
  rinseRequired: false,
  requiredPPE: '',
  dangerousCombinations: '',
  applicationInstructions: '',
  storageInstructions: '',
  expirationDate: '',
  dateCode: '',
  epaRegistrationNumber: '',
  sdsReference: '',
  ownerReviewNotes: '',
};

const STATUS_LABELS = {
  candidate: 'Candidate',
  pending_review: 'Pending review',
  owner_tested: 'Owner tested',
  approved: 'Approved',
  restricted: 'Restricted',
  rejected: 'Rejected',
  expired: 'Expired',
  retired: 'Retired',
};

function list(value) {
  return value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function recordToForm(record) {
  return {
    ...INITIAL_FORM,
    ...record,
    intendedUses: record.intendedUses.join('\n'),
    compatibleSurfaces: record.compatibleSurfaces.join('\n'),
    prohibitedSurfaces: record.prohibitedSurfaces.join('\n'),
    requiredPPE: record.requiredPPE.join('\n'),
    dangerousCombinations: record.dangerousCombinations.join('\n'),
  };
}

function MethodDetails({ record }) {
  return (
    <div className="cleaning-method-details">
      <p><strong>Classification:</strong> {record.classification === 'cleaning' ? 'Cleaning only' : record.classification}</p>
      <p><strong>Employee visibility:</strong> {record.employeeVisible ? 'Employee-visible' : 'Not employee-visible'}</p>
      {record.intendedUses.length > 0 && <p><strong>Uses:</strong> {record.intendedUses.join(', ')}</p>}
      {record.compatibleSurfaces.length > 0 && <p><strong>Approved surfaces:</strong> {record.compatibleSurfaces.join(', ')}</p>}
      {record.prohibitedSurfaces.length > 0 && <p className="cleaning-method-warning"><strong>Do not use on:</strong> {record.prohibitedSurfaces.join(', ')}</p>}
      {record.formulaVariants.length > 0 && (
        <div>
          <strong>Formula variants</strong>
          {record.formulaVariants.map(variant => (
            <div key={variant.id} className="cleaning-method-formula">
              <span>{variant.name}</span>
              <ul>{(variant.measurements || []).map(measurement => <li key={measurement}>{measurement}</li>)}</ul>
              {variant.expectedYield && <small>Yield: {variant.expectedYield}</small>}
            </div>
          ))}
        </div>
      )}
      {record.measurements.length > 0 && <p><strong>Formula:</strong> {record.measurements.join(' + ')}</p>}
      {record.dwellTime && <p><strong>Dwell time:</strong> {record.dwellTime}</p>}
      {record.shelfLife && <p><strong>Shelf life:</strong> {record.shelfLife}</p>}
      {record.applicationInstructions && <p><strong>Application:</strong> {record.applicationInstructions}</p>}
      {record.rinseInstructions && <p><strong>Rinse:</strong> {record.rinseInstructions}</p>}
      {record.dryingInstructions && <p><strong>Drying:</strong> {record.dryingInstructions}</p>}
      {record.requiredPPE.length > 0 && <p><strong>PPE:</strong> {record.requiredPPE.join(', ')}</p>}
      {record.dangerousCombinations.length > 0 && <p className="cleaning-method-warning"><strong>Warnings:</strong> {record.dangerousCombinations.join(' ')}</p>}
      {record.ownerReviewNotes && <p><strong>Owner note:</strong> {record.ownerReviewNotes}</p>}
    </div>
  );
}

export default function CleaningProductsMethodsSection({ tenantId, actorUid, canManage }) {
  const systemDefaults = useMemo(() => getStarterCleaningMethods(), []);
  const [tenantRecords, setTenantRecords] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [reviewNotes, setReviewNotes] = useState({});
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (!tenantId || !canManage) {
      setTenantRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setTenantRecords(await listTenantCleaningRecords(tenantId));
    } catch {
      setError('Cleaning products could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [canManage, tenantId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => active && load());
    return () => { active = false; };
  }, [load]);

  if (!canManage) return null;

  const updateForm = event => {
    const { checked, name, type, value } = event.target;
    setForm(current => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setError('');
    setSuccess('');
  };

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const proposed = {
        ...form,
        name: [form.brand, form.productName, form.variant].filter(Boolean).join(' '),
        category: form.productCategory,
        intendedUses: list(form.intendedUses),
        compatibleSurfaces: list(form.compatibleSurfaces),
        prohibitedSurfaces: list(form.prohibitedSurfaces),
        requiredPPE: list(form.requiredPPE),
        dangerousCombinations: list(form.dangerousCombinations),
      };
      const product = editingId
        ? await updateTenantCommercialProduct(tenantId, editingId, proposed, { actorUid })
        : await createTenantCommercialProduct(tenantId, proposed, { actorUid });
      setTenantRecords(current => editingId
        ? current.map(item => item.id === product.id ? product : item).sort((a, b) => a.name.localeCompare(b.name))
        : [...current, product].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(INITIAL_FORM);
      setEditingId('');
      setSuccess(editingId
        ? 'Commercial product details updated. Review status was not changed.'
        : 'Commercial product added as pending review. It is not employee-usable yet.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Commercial product could not be added.');
    } finally {
      setSaving(false);
    }
  };

  const review = async (record, action) => {
    setActingId(record.id);
    setError('');
    setSuccess('');
    try {
      const updated = await reviewTenantCleaningRecord(tenantId, record.id, action, {
        actorUid,
        ownerReviewNotes: reviewNotes[record.id] ?? record.ownerReviewNotes,
      });
      setTenantRecords(current => current.map(item => item.id === updated.id ? updated : item));
      setSuccess(`${updated.name} marked ${statusLabel(action).toLowerCase()}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Product review could not be saved.');
    } finally {
      setActingId('');
    }
  };

  const adopt = async record => {
    setActingId(record.id);
    setError('');
    setSuccess('');
    try {
      const adopted = await adoptSystemDefaultMethod(tenantId, record, { actorUid });
      setTenantRecords(current => [
        ...current.filter(item => item.id !== adopted.id),
        adopted,
      ].sort((left, right) => left.name.localeCompare(right.name)));
      setSuccess(`${record.name} added for owner review. It is not employee-usable yet.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Company method could not be adopted.');
    } finally {
      setActingId('');
    }
  };

  return (
    <section className="v1-card cleaning-methods-section" aria-labelledby="cleaning-methods-title">
      <div>
        <p className="cleaning-methods-eyebrow">Owner/admin controls</p>
        <h2 id="cleaning-methods-title">Cleaning Products &amp; Methods</h2>
        <p className="v1-muted">Review company methods and approve exact commercial label information. Nothing is approved automatically.</p>
      </div>

      <details className="cleaning-methods-group">
        <summary>Company methods <span>{systemDefaults.length} system defaults</span></summary>
        <div className="cleaning-methods-list">
          {systemDefaults.map(record => {
            const adopted = tenantRecords.find(item => item.sourceDefaultId === record.id);
            return <details className="cleaning-method-card" key={record.id}>
              <summary>
                <span>{record.name}</span>
                <span className={`cleaning-status cleaning-status-${record.status}`}>{statusLabel(record.status)}</span>
              </summary>
              <p className="cleaning-method-immutable">System default · inspect only · not employee-visible</p>
              <MethodDetails record={record} />
              {adopted ? (
                <p className="cleaning-adopted-copy">Company copy: {statusLabel(adopted.status)}.</p>
              ) : (
                <button type="button" className="v1-button v1-button-secondary" disabled={actingId === record.id} onClick={() => adopt(record)}>
                  {actingId === record.id ? 'Adding...' : 'Use for my company'}
                </button>
              )}
            </details>
          })}
        </div>
      </details>

      <div className="cleaning-methods-group">
        <div className="cleaning-methods-heading">
          <div>
            <h3>Commercial product intake</h3>
            <p>Enter only exact information from the product container and manufacturer materials.</p>
          </div>
          <span className="cleaning-pending-copy">Pending review — do not use yet.</span>
        </div>
        {editingId && <p className="cleaning-editing-copy">Editing an existing product. Its review status will not change.</p>}
        <form className="cleaning-product-form" onSubmit={submit} aria-label="Commercial product intake">
          <label>Brand *<input name="brand" value={form.brand} onChange={updateForm} required /></label>
          <label>Product *<input name="productName" value={form.productName} onChange={updateForm} required /></label>
          <label>Variant *<input name="variant" value={form.variant} onChange={updateForm} required /></label>
          <label>Manufacturer *<input name="manufacturer" value={form.manufacturer} onChange={updateForm} required /></label>
          <label>Container size *<input name="containerSize" value={form.containerSize} onChange={updateForm} required /></label>
          <label>Product category *<input name="productCategory" value={form.productCategory} onChange={updateForm} required /></label>
          <label>Classification
            <select name="classification" value={form.classification} onChange={updateForm}>
              <option value="cleaning">Cleaning</option>
              <option value="sanitizing">Sanitizing</option>
              <option value="disinfecting">Disinfecting</option>
            </select>
          </label>
          <label>Container condition
            <select name="containerCondition" value={form.containerCondition} onChange={updateForm}>
              <option value="unknown">Not confirmed</option>
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
              <option value="leaking">Leaking</option>
            </select>
          </label>
          <label className="cleaning-form-wide">Label-supported uses *<textarea name="intendedUses" value={form.intendedUses} onChange={updateForm} rows="2" placeholder="One per line" required /></label>
          <label className="cleaning-form-wide">Compatible surfaces<textarea name="compatibleSurfaces" value={form.compatibleSurfaces} onChange={updateForm} rows="2" placeholder="Exact label guidance" /></label>
          <label className="cleaning-form-wide">Prohibited surfaces<textarea name="prohibitedSurfaces" value={form.prohibitedSurfaces} onChange={updateForm} rows="2" placeholder="Exact label restrictions" /></label>
          <label className="cleaning-form-wide">Label directions *<textarea name="labelDirections" value={form.labelDirections} onChange={updateForm} rows="3" required /></label>
          <label className="cleaning-form-wide">Application instructions<textarea name="applicationInstructions" value={form.applicationInstructions} onChange={updateForm} rows="2" /></label>
          <label>Contact time<input name="contactTime" value={form.contactTime} onChange={updateForm} /></label>
          <label>EPA registration number<input name="epaRegistrationNumber" value={form.epaRegistrationNumber} onChange={updateForm} /></label>
          <label>SDS reference<input name="sdsReference" value={form.sdsReference} onChange={updateForm} /></label>
          <label>Expiration date<input name="expirationDate" type="date" value={form.expirationDate} onChange={updateForm} /></label>
          <label>Date code<input name="dateCode" value={form.dateCode} onChange={updateForm} /></label>
          <label className="cleaning-form-wide">PPE / ventilation *<textarea name="requiredPPE" value={form.requiredPPE} onChange={updateForm} rows="2" placeholder="Enter None listed if the label says none" required /></label>
          <label className="cleaning-form-wide">Warnings and dangerous combinations *<textarea name="dangerousCombinations" value={form.dangerousCombinations} onChange={updateForm} rows="2" required /></label>
          <label className="cleaning-form-wide">Storage instructions<textarea name="storageInstructions" value={form.storageInstructions} onChange={updateForm} rows="2" /></label>
          <label className="cleaning-form-wide">Owner review notes<textarea name="ownerReviewNotes" value={form.ownerReviewNotes} onChange={updateForm} rows="2" /></label>
          <label className="cleaning-check"><input name="donatedProduct" type="checkbox" checked={form.donatedProduct} onChange={updateForm} /> Donated product</label>
          <label className="cleaning-check"><input name="labelInformationComplete" type="checkbox" checked={form.labelInformationComplete} onChange={updateForm} /> Label information is complete and readable</label>
          <label className="cleaning-check"><input name="requiresDilution" type="checkbox" checked={form.requiresDilution} onChange={updateForm} /> Concentrated / requires dilution</label>
          {form.requiresDilution && <label className="cleaning-form-wide">Dilution instructions *<textarea name="dilutionInstructions" value={form.dilutionInstructions} onChange={updateForm} rows="2" required /></label>}
          <label className="cleaning-check"><input name="rinseRequired" type="checkbox" checked={form.rinseRequired} onChange={updateForm} /> Label requires rinsing</label>
          <div className="cleaning-form-actions cleaning-form-wide">
            <button className="v1-button v1-button-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update review details' : 'Add for review'}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(''); setForm(INITIAL_FORM); }}>
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="cleaning-methods-group">
        <h3>Company methods and commercial products</h3>
        {loading && <p role="status">Loading cleaning products...</p>}
        {!loading && tenantRecords.length === 0 && <p className="v1-muted">No company methods or commercial products have been added for this tenant.</p>}
        <div className="cleaning-methods-list">
          {tenantRecords.map(record => {
            const approvalIssues = getCleaningRecordApprovalIssues(record);
            return (
              <article className="cleaning-method-card cleaning-commercial-card" key={record.id}>
                <div className="cleaning-commercial-title">
                  <div>
                    <h4>{record.name}</h4>
                    <p>{record.recordType === 'company_mix' ? 'Adopted company method' : `${record.manufacturer} · ${record.containerSize}`}</p>
                  </div>
                  <span className={`cleaning-status cleaning-status-${record.status}`}>{statusLabel(record.status)}</span>
                </div>
                {record.status === 'pending_review' && <p className="cleaning-pending-copy">Pending review — do not use yet.</p>}
                {record.status === 'restricted' && <p className="cleaning-method-warning"><strong>Restrictions:</strong> {record.ownerReviewNotes || record.prohibitedSurfaces.join(', ')}</p>}
                {record.recordType === 'company_mix' ? <MethodDetails record={record} /> : (
                  <>
                    <p><strong>Classification:</strong> {record.classification}</p>
                    <p><strong>Uses:</strong> {record.intendedUses.join(', ') || 'Not entered'}</p>
                    <p><strong>Surfaces:</strong> {record.compatibleSurfaces.join(', ') || record.prohibitedSurfaces.join(', ') || 'Not entered'}</p>
                  </>
                )}
                {approvalIssues.length > 0 && (
                  <div className="cleaning-approval-issues">
                    <strong>Before approval</strong>
                    <ul>{approvalIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>
                  </div>
                )}
                <label className="cleaning-review-notes">Review notes / restrictions
                  <textarea
                    value={reviewNotes[record.id] ?? record.ownerReviewNotes}
                    onChange={event => setReviewNotes(current => ({ ...current, [record.id]: event.target.value }))}
                    rows="2"
                  />
                </label>
                <div className="cleaning-review-actions" aria-label={`Review ${record.name}`}>
                  {record.recordType === 'commercial_product' && (
                    <button type="button" disabled={actingId === record.id} onClick={() => { setEditingId(record.id); setForm(recordToForm(record)); setError(''); setSuccess(''); }}>Edit details</button>
                  )}
                  <button type="button" disabled={actingId === record.id} onClick={() => review(record, 'approved')}>Approve</button>
                  <button type="button" disabled={actingId === record.id} onClick={() => review(record, 'restricted')}>Restrict</button>
                  <button type="button" disabled={actingId === record.id} onClick={() => review(record, 'rejected')}>Reject</button>
                  <button type="button" disabled={actingId === record.id} onClick={() => review(record, 'expired')}>Mark expired</button>
                  <button type="button" disabled={actingId === record.id} onClick={() => review(record, 'retired')}>Retire</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {error && <div className="cleaning-method-message cleaning-method-error" role="alert">{error}</div>}
      {success && <div className="cleaning-method-message cleaning-method-success" role="status">{success}</div>}
    </section>
  );
}
