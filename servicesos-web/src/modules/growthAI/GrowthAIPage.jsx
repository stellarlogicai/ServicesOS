import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { BRANDS, CONTENT_IDEAS, PLATFORMS } from './brandProfiles';
import { generateDraft } from './growthAIService';
import { RESPONSE_CHANNELS, RESPONSE_SCENARIOS, buildResponseTemplate } from './responseTemplates';
import {
  approveGrowthAIDraft,
  createGrowthAIDraft,
  GROWTH_AI_PILLARS,
  listGrowthAIDraftAudit,
  listGrowthAIDrafts,
  loadGrowthAIBrandProfile,
  returnGrowthAIDraftToDraft,
  saveGrowthAIBrandProfile,
  submitGrowthAIDraftForReview,
  updateGrowthAIDraftContent,
} from './growthAIFoundationService';

const colors = {
  background: '#f8fafc', panel: '#fff', border: '#dbe3ec', primary: '#1d4ed8',
  text: '#172033', muted: '#64748b', success: '#047857', warning: '#a16207', danger: '#b91c1c',
};

const emptyContent = { fullCaption: '', shortCaption: '', callToAction: '', hashtags: '', imagePrompt: '' };
const emptyInputs = {
  platform: 'facebook', tone: '', cta: '', extraNotes: '', serviceType: '', serviceArea: '',
  offer: '', dateRange: '', cleaningTopic: '',
};
const controlStyle = {
  width: '100%', boxSizing: 'border-box', padding: '9px 10px', border: `1px solid ${colors.border}`,
  borderRadius: 6, background: '#fff', color: colors.text, font: 'inherit',
};

function Card({ children }) {
  return <section style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 18 }}>{children}</section>;
}

function Field({ label, children }) {
  return <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#334155' }}>{label}{children}</label>;
}

function Button({ children, onClick, disabled, tone = 'primary' }) {
  const palette = {
    primary: { background: colors.primary, color: '#fff', border: colors.primary },
    secondary: { background: '#fff', color: colors.text, border: '#94a3b8' },
    success: { background: colors.success, color: '#fff', border: colors.success },
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      padding: '9px 13px', borderRadius: 6, border: `1px solid ${palette.border}`, background: palette.background,
      color: palette.color, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
    }}>{children}</button>
  );
}

function CopyButton({ label, text }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    const fallback = () => {
      const textarea = document.createElement('textarea');
      try {
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand?.('copy');
      } finally {
        textarea.remove();
      }
    };

    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else fallback();
      setCopied(true);
    } catch {
      fallback();
      setCopied(true);
    }
  }, [text]);

  return <Button tone="secondary" disabled={!text} onClick={copy}>{copied ? 'Copied' : label}</Button>;
}

function CustomerResponseHelper({ businessName, onSave, saving }) {
  const scenarios = RESPONSE_SCENARIOS.auntbs;
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [channelId, setChannelId] = useState('sms');
  const responseTemplate = useMemo(() => {
    const template = buildResponseTemplate({ brandKey: 'auntbs', scenarioId, channelId });
    const replaceBusinessName = value => value
      .replaceAll("Aunt B's Cleaning Services", businessName)
      .replace(/^Aunt B response/, `${businessName} response`);
    return {
      ...template,
      title: replaceBusinessName(template.title),
      subjectLine: replaceBusinessName(template.subjectLine),
      messageTemplate: replaceBusinessName(template.messageTemplate),
    };
  }, [businessName, channelId, scenarioId]);

  return (
    <Card>
      <h2 style={{ margin: '0 0 5px', fontSize: 17, color: colors.text }}>Customer response draft helper</h2>
      <p style={{ margin: '0 0 14px', color: colors.muted, fontSize: 12 }}>
        Deterministic private templates only. Nothing is sent automatically. Review and edit before sending manually.
      </p>
      <div style={{ display: 'grid', gap: 11 }}>
        <Field label="Response scenario">
          <select aria-label="Response scenario" value={scenarioId} onChange={event => setScenarioId(event.target.value)} style={controlStyle}>
            {scenarios.map(item => <option key={item.id} value={item.id}>{item.scenario}</option>)}
          </select>
        </Field>
        <Field label="Response channel">
          <select aria-label="Response channel" value={channelId} onChange={event => setChannelId(event.target.value)} style={controlStyle}>
            {RESPONSE_CHANNELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <div style={{ padding: 12, background: '#f8fafc', border: `1px solid ${colors.border}`, borderRadius: 6 }}>
          <strong style={{ display: 'block', fontSize: 14 }}>{responseTemplate.title}</strong>
          {responseTemplate.subjectLine && <p style={{ margin: '8px 0 0', fontSize: 12 }}><strong>Subject:</strong> {responseTemplate.subjectLine}</p>}
          <p style={{ margin: '9px 0 0', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>{responseTemplate.messageTemplate}</p>
        </div>
        <p style={{ margin: 0, color: colors.muted, fontSize: 12 }}>{responseTemplate.notes}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <CopyButton label="Copy response" text={responseTemplate.messageTemplate} />
          <Button tone="secondary" disabled={saving} onClick={() => onSave(responseTemplate)}>Save response draft</Button>
        </div>
      </div>
    </Card>
  );
}

function statusLabel(status) {
  if (status === 'needs_review') return 'Needs review';
  if (status === 'approved') return 'Approved';
  return 'Draft';
}

function formatTimestamp(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Pending server timestamp';
}

function draftToEditor(draft) {
  return {
    id: draft.id, pillar: draft.pillar, actionType: draft.actionType, title: draft.title,
    content: { ...emptyContent, ...draft.content }, sourceRefs: draft.sourceRefs || {}, status: draft.status,
    approvedByUid: draft.approvedByUid, approvedAt: draft.approvedAt,
  };
}

export default function GrowthAIPage() {
  const { currentTenant, role, tenantId } = useAuth();
  const [profile, setProfile] = useState({ brandVoice: '', contentTone: '', defaultCTA: '' });
  const [drafts, setDrafts] = useState([]);
  const [audit, setAudit] = useState([]);
  const [postTypeId, setPostTypeId] = useState('availability');
  const [inputs, setInputs] = useState(emptyInputs);
  const [editor, setEditor] = useState({
    id: null, pillar: 'attract', actionType: 'marketing_post', title: '', content: emptyContent,
    sourceRefs: {}, status: 'draft', approvedByUid: null, approvedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const auditRequestSequence = useRef(0);

  const businessSettings = currentTenant?.businessSettings || {};
  const businessName = businessSettings.businessName || currentTenant?.businessName || 'Your business';
  const brand = useMemo(() => ({
    ...BRANDS.auntbs,
    name: businessName,
    tone: profile.contentTone || profile.brandVoice || 'friendly, trustworthy, and clear',
    defaultCTA: profile.defaultCTA || 'Contact us to learn more.',
  }), [businessName, profile]);
  const postType = brand.postTypes.find(item => item.id === postTypeId) || brand.postTypes[0];
  const authorized = role === 'admin' || role === 'super-admin';

  const reloadWorkspace = useCallback(async selectedDraftId => {
    if (!tenantId) return;
    const [savedProfile, savedDrafts] = await Promise.all([
      loadGrowthAIBrandProfile(tenantId), listGrowthAIDrafts(tenantId),
    ]);
    setProfile({
      brandVoice: savedProfile?.brandVoice || '', contentTone: savedProfile?.contentTone || '',
      defaultCTA: savedProfile?.defaultCTA || '',
    });
    setDrafts(savedDrafts);
    const selected = savedDrafts.find(item => item.id === selectedDraftId);
    if (selected) setEditor(draftToEditor(selected));
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    if (!authorized || !tenantId) {
      return () => { active = false; };
    }
    Promise.all([loadGrowthAIBrandProfile(tenantId), listGrowthAIDrafts(tenantId)])
      .then(([savedProfile, savedDrafts]) => {
        if (!active) return;
        setProfile({
          brandVoice: savedProfile?.brandVoice || '', contentTone: savedProfile?.contentTone || '',
          defaultCTA: savedProfile?.defaultCTA || '',
        });
        setDrafts(savedDrafts);
      })
      .catch(err => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [authorized, tenantId]);

  const loadAudit = useCallback(async draftId => {
    const requestSequence = ++auditRequestSequence.current;
    if (!draftId) {
      setAudit([]);
      return;
    }
    try {
      const nextAudit = await listGrowthAIDraftAudit(tenantId, draftId);
      if (requestSequence === auditRequestSequence.current) setAudit(nextAudit);
    } catch (err) {
      if (requestSequence === auditRequestSequence.current) throw err;
    }
  }, [tenantId]);

  const runAction = useCallback(async (action, successMessage) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      const selectedId = result?.id || editor.id;
      await reloadWorkspace(selectedId);
      await loadAudit(selectedId);
      setMessage(successMessage);
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setSaving(false);
    }
  }, [editor.id, loadAudit, reloadWorkspace]);

  const generate = () => {
    const { generated } = generateDraft(brand, postType, inputs);
    setEditor(previous => ({
      ...previous, id: null, pillar: 'attract', actionType: 'marketing_post', title: generated.title,
      content: { ...emptyContent, ...generated }, sourceRefs: {}, status: 'draft', approvedByUid: null, approvedAt: null,
    }));
    void loadAudit(null);
    setMessage('Deterministic draft created locally. Save it to persist it for this tenant.');
    setError('');
  };

  const saveResponseDraft = responseTemplate => runAction(
    () => createGrowthAIDraft(tenantId, {
      pillar: 'convert',
      actionType: 'customer_response',
      title: `[Customer response] ${responseTemplate.title}`,
      content: {
        ...emptyContent,
        fullCaption: responseTemplate.messageTemplate,
        shortCaption: responseTemplate.subjectLine || responseTemplate.messageTemplate.slice(0, 140),
        callToAction: 'Review and send manually',
      },
      sourceRefs: {},
    }),
    'Customer response draft saved for this tenant. Nothing was sent.',
  );

  const draftInput = () => ({
    pillar: editor.pillar, actionType: editor.actionType, title: editor.title,
    content: editor.content, sourceRefs: editor.sourceRefs,
  });

  const saveDraft = async () => {
    if (!editor.content.fullCaption.trim()) return setError('Add draft content before saving.');
    if (!editor.id) {
      await runAction(() => createGrowthAIDraft(tenantId, draftInput()), 'Draft saved for this tenant.');
      return;
    }
    const wasApproved = editor.status === 'approved';
    await runAction(
      () => updateGrowthAIDraftContent(tenantId, editor.id, draftInput()),
      wasApproved ? 'Material content changed. Prior approval was cleared and review is required again.' : 'Draft changes saved.',
    );
  };

  const selectDraft = async draft => {
    setEditor(draftToEditor(draft));
    setMessage('');
    setError('');
    try { await loadAudit(draft.id); } catch (err) { setError(err.message); }
  };

  const transition = async (operation, successMessage) => {
    await runAction(() => operation(tenantId, editor.id), successMessage);
  };

  const saveProfile = () => runAction(async () => {
    await saveGrowthAIBrandProfile(tenantId, profile);
    return { id: editor.id };
  }, 'GrowthAI brand preferences saved.');

  if (!authorized) return <div style={{ padding: 24 }}>GrowthAI is available only to tenant owners and administrators.</div>;
  if (!tenantId) return <div style={{ padding: 24 }}>Select a tenant to use GrowthAI.</div>;

  return (
    <main style={{ minHeight: '100vh', background: colors.background, color: colors.text }}>
      <header style={{ padding: '18px 24px', background: '#172033', color: '#fff' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>GrowthAI Draft Workspace</h1>
        <p style={{ margin: '5px 0 0', color: '#cbd5e1', fontSize: 13 }}>
          Deterministic content only. Human review is required. Approval does not send or publish anything.
        </p>
      </header>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 20, display: 'grid', gap: 16 }}>
        {loading && <div>Loading tenant GrowthAI workspace...</div>}
        {error && <div role="alert" style={{ color: colors.danger, background: '#fef2f2', padding: 10, borderRadius: 6 }}>{error}</div>}
        {message && <div role="status" style={{ color: colors.success, background: '#ecfdf5', padding: 10, borderRadius: 6 }}>{message}</div>}

        <Card>
          <h2 style={{ margin: '0 0 5px', fontSize: 17, color: colors.text }}>Tenant brand profile</h2>
          <p style={{ margin: '0 0 14px', color: colors.muted, fontSize: 12 }}>
            Business identity comes from Business Settings. Only GrowthAI-specific preferences are stored here.
          </p>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <Field label="Business name"><input aria-label="Business name" value={businessName} readOnly style={{ ...controlStyle, background: '#f1f5f9' }} /></Field>
            <Field label="Brand voice"><input aria-label="Brand voice" value={profile.brandVoice} onChange={event => setProfile(value => ({ ...value, brandVoice: event.target.value }))} style={controlStyle} /></Field>
            <Field label="Content tone"><input aria-label="Content tone" value={profile.contentTone} onChange={event => setProfile(value => ({ ...value, contentTone: event.target.value }))} style={controlStyle} /></Field>
            <Field label="Default call to action"><input aria-label="Default call to action" value={profile.defaultCTA} onChange={event => setProfile(value => ({ ...value, defaultCTA: event.target.value }))} style={controlStyle} /></Field>
          </div>
          <div style={{ marginTop: 12 }}><Button onClick={saveProfile} disabled={saving}>Save brand preferences</Button></div>
        </Card>

        <div className="growth-ai-workspace-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <Card>
              <h2 style={{ margin: '0 0 12px', fontSize: 17, color: colors.text }}>Deterministic draft builder</h2>
              <div style={{ display: 'grid', gap: 11 }}>
                <Field label="Post type"><select aria-label="Post type" value={postTypeId} onChange={event => setPostTypeId(event.target.value)} style={controlStyle}>{brand.postTypes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                <Field label="Platform"><select aria-label="Platform" value={inputs.platform} onChange={event => setInputs(value => ({ ...value, platform: event.target.value }))} style={controlStyle}>{PLATFORMS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                <Field label="Service type"><input aria-label="Service type" value={inputs.serviceType} onChange={event => setInputs(value => ({ ...value, serviceType: event.target.value }))} style={controlStyle} /></Field>
                <Field label="Service area"><input aria-label="Service area" value={inputs.serviceArea} onChange={event => setInputs(value => ({ ...value, serviceArea: event.target.value }))} style={controlStyle} /></Field>
                <Field label="Offer"><input aria-label="Offer" value={inputs.offer} onChange={event => setInputs(value => ({ ...value, offer: event.target.value }))} style={controlStyle} /></Field>
                <Field label="Cleaning topic"><input aria-label="Cleaning topic" value={inputs.cleaningTopic} onChange={event => setInputs(value => ({ ...value, cleaningTopic: event.target.value }))} style={controlStyle} /></Field>
                <Field label="Extra notes"><textarea aria-label="Extra notes" rows="2" value={inputs.extraNotes} onChange={event => setInputs(value => ({ ...value, extraNotes: event.target.value }))} style={controlStyle} /></Field>
                <Button onClick={generate}>Create deterministic draft</Button>
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {CONTENT_IDEAS.auntbs.slice(0, 4).map(idea => <Button key={idea.label} tone="secondary" onClick={() => {
                  setPostTypeId(idea.prefill.postTypeId);
                  setInputs(value => ({ ...value, ...idea.prefill.inputs }));
                }}>{idea.label}</Button>)}
              </div>
            </Card>

            <CustomerResponseHelper businessName={businessName} onSave={saveResponseDraft} saving={saving} />

            <Card>
              <h2 style={{ margin: '0 0 12px', fontSize: 17, color: colors.text }}>Tenant drafts ({drafts.length})</h2>
              {drafts.length === 0 && <p style={{ color: colors.muted, fontSize: 13 }}>No tenant drafts saved yet.</p>}
              <div style={{ display: 'grid', gap: 8 }}>
                {drafts.map(draft => <button type="button" key={draft.id} onClick={() => selectDraft(draft)} style={{
                  padding: 10, textAlign: 'left', borderRadius: 6,
                  border: `1px solid ${editor.id === draft.id ? colors.primary : colors.border}`, background: '#fff', color: colors.text, cursor: 'pointer',
                }}><strong>{draft.title}</strong><span style={{ display: 'block', marginTop: 4, color: colors.muted, fontSize: 12 }}>{statusLabel(draft.status)} | {draft.pillar} | v{draft.version}</span></button>)}
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 12 }}>
                <div><h2 style={{ margin: 0, fontSize: 17, color: colors.text }}>Draft editor</h2><p style={{ margin: '4px 0 0', color: colors.muted, fontSize: 12 }}>Material edits to approved content automatically clear approval and require review again.</p></div>
                <strong style={{ color: editor.status === 'approved' ? colors.success : editor.status === 'needs_review' ? colors.warning : colors.muted }}>{statusLabel(editor.status)}</strong>
              </div>
              <div style={{ display: 'grid', gap: 11 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Pillar"><select aria-label="Pillar" value={editor.pillar} onChange={event => setEditor(value => ({ ...value, pillar: event.target.value }))} style={controlStyle}>{GROWTH_AI_PILLARS.map(item => <option key={item} value={item}>{item}</option>)}</select></Field>
                  <Field label="Action type"><input aria-label="Action type" value={editor.actionType} readOnly style={{ ...controlStyle, background: '#f1f5f9' }} /></Field>
                </div>
                <Field label="Title"><input aria-label="Draft title" value={editor.title} onChange={event => setEditor(value => ({ ...value, title: event.target.value }))} style={controlStyle} /></Field>
                <Field label="Full caption"><textarea aria-label="Full caption" rows="9" value={editor.content.fullCaption} onChange={event => setEditor(value => ({ ...value, content: { ...value.content, fullCaption: event.target.value } }))} style={controlStyle} /></Field>
                <Field label="Short caption"><textarea aria-label="Short caption" rows="3" value={editor.content.shortCaption} onChange={event => setEditor(value => ({ ...value, content: { ...value.content, shortCaption: event.target.value } }))} style={controlStyle} /></Field>
                <Field label="Call to action"><input aria-label="Call to action" value={editor.content.callToAction} onChange={event => setEditor(value => ({ ...value, content: { ...value.content, callToAction: event.target.value } }))} style={controlStyle} /></Field>
                <Field label="Hashtags"><input aria-label="Hashtags" value={editor.content.hashtags} onChange={event => setEditor(value => ({ ...value, content: { ...value.content, hashtags: event.target.value } }))} style={controlStyle} /></Field>
                <Field label="Image prompt"><textarea aria-label="Image prompt" rows="3" value={editor.content.imagePrompt} onChange={event => setEditor(value => ({ ...value, content: { ...value.content, imagePrompt: event.target.value } }))} style={controlStyle} /></Field>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <CopyButton label="Copy full caption" text={editor.content.fullCaption} />
                <CopyButton label="Copy short caption" text={editor.content.shortCaption} />
                <CopyButton label="Copy call to action" text={editor.content.callToAction} />
                <CopyButton label="Copy hashtags" text={editor.content.hashtags} />
                <CopyButton label="Copy image prompt" text={editor.content.imagePrompt} />
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={saveDraft} disabled={saving || !editor.content.fullCaption}>Save {editor.id ? 'changes' : 'as new draft'}</Button>
                {editor.id && editor.status === 'draft' && <Button tone="secondary" disabled={saving} onClick={() => transition(submitGrowthAIDraftForReview, 'Draft submitted for review.')}>Submit for review</Button>}
                {editor.id && editor.status === 'needs_review' && <Button tone="success" disabled={saving} onClick={() => transition(approveGrowthAIDraft, 'Approved inside ServicesOS. Nothing was sent or published.')}>Approve</Button>}
                {editor.id && ['needs_review', 'approved'].includes(editor.status) && <Button tone="secondary" disabled={saving} onClick={() => transition(returnGrowthAIDraftToDraft, 'Content returned to draft status.')}>Return to draft</Button>}
              </div>
              {editor.status === 'approved' && <p style={{ margin: '12px 0 0', fontSize: 12, color: colors.success }}>Approved by {editor.approvedByUid} at {formatTimestamp(editor.approvedAt)}. This approval is internal only.</p>}
            </Card>

            <Card>
              <h2 style={{ margin: '0 0 10px', fontSize: 17, color: colors.text }}>Immutable audit history</h2>
              {!editor.id && <p style={{ margin: 0, color: colors.muted, fontSize: 13 }}>Save or select a draft to view its audit history.</p>}
              {editor.id && audit.length === 0 && <p style={{ margin: 0, color: colors.muted, fontSize: 13 }}>No audit entries loaded.</p>}
              <div style={{ display: 'grid', gap: 7 }}>{audit.map(entry => <div key={entry.id} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 7, fontSize: 12 }}><strong>{entry.action.replaceAll('_', ' ')}</strong><span style={{ color: colors.muted }}> | {entry.fromStatus || 'none'} to {entry.toStatus} | {formatTimestamp(entry.timestamp)}</span></div>)}</div>
            </Card>
          </div>
        </div>
      </div>
      <style>{'@media (max-width: 780px) { .growth-ai-workspace-grid { grid-template-columns: 1fr !important; } }'}</style>
    </main>
  );
}
