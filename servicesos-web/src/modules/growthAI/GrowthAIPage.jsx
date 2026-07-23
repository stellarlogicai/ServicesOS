// src/modules/growthAI/GrowthAIPage.jsx
/**
 * GrowthAI Phase 0 — Marketing Helper
 *
 * Internal tool for Aunt B's Cleaning Services and Stellar Logic AI.
 *
 * Phase 0 guarantees:
 *  ✅ No browser-side AI API calls (Anthropic, OpenAI, Gemini, Firebase AI)
 *  ✅ No browser-exposed AI provider secret usage
 *  ✅ No real credit deduction — estimated only
 *  ✅ No auto-posting
 *  ✅ No image generation API
 *  ✅ localStorage draft persistence (Phase 1 → Firestore)
 *  ✅ super-admin access only (enforced by App.jsx NAV_ITEMS roles gate)
 */
import { useState, useCallback } from 'react';
import {
  BRANDS, PLATFORMS, CREDIT_COSTS, DRAFT_STATUS, CONTENT_IDEAS,
} from './brandProfiles';
import {
  generateDraft, regenerateCaption, generateImagePromptOnly,
} from './growthAIService';
import {
  RESPONSE_CHANNELS, RESPONSE_SCENARIOS, buildResponseTemplate,
} from './responseTemplates';
import {
  loadDrafts, createDraftRecord, updateDraftRecord, addGenerationEvent,
  insertDraft, upsertDraft, removeDraft, duplicateDraft, patchDraftStatus,
} from './draftStorage';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       '#f8fafc',
  panel:    '#ffffff',
  border:   '#e2e8f0',
  accent:   '#3b82f6',
  accentDk: '#1d4ed8',
  text:     '#111827',
  muted:    '#6b7280',
  success:  '#10b981',
  warn:     '#f59e0b',
  error:    '#ef4444',
  purple:   '#7c3aed',
};

// ─── Primitive UI helpers ─────────────────────────────────────────────────────
function Label({ children, required }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
      {children}{required && <span style={{ color: C.error, marginLeft: 2 }}>*</span>}
    </label>
  );
}

function FieldInput({ value, onChange, placeholder, multiline, rows = 3, disabled }) {
  const base = {
    width: '100%', padding: '8px 10px',
    border: `1px solid ${C.border}`, borderRadius: 6,
    fontSize: 13, color: C.text,
    background: disabled ? '#f9fafb' : '#fff',
    boxSizing: 'border-box', fontFamily: 'inherit',
    resize: multiline ? 'vertical' : undefined,
  };
  return multiline
    ? <textarea rows={rows} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} style={base} />
    : <input type="text" value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} style={base} />;
}

function FieldSelect({ value, onChange, options, disabled, ariaLabel }) {
  return (
    <select
      aria-label={ariaLabel}
      value={value} onChange={onChange} disabled={disabled}
      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, color: C.text, background: disabled ? '#f9fafb' : '#fff', boxSizing: 'border-box' }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Btn({ onClick, disabled, loading, children, variant = 'primary', small, fullWidth }) {
  const variants = {
    primary:  { background: `linear-gradient(135deg,${C.accent},${C.accentDk})`, color: '#fff', border: 'none' },
    secondary:{ background: 'transparent', color: C.accent, border: `1px solid ${C.accent}` },
    ghost:    { background: 'transparent', color: C.muted, border: `1px solid ${C.border}` },
    success:  { background: `linear-gradient(135deg,${C.success},#059669)`, color: '#fff', border: 'none' },
    warn:     { background: 'transparent', color: C.warn, border: `1px solid ${C.warn}` },
    danger:   { background: 'transparent', color: C.error, border: `1px solid ${C.error}` },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        ...variants[variant],
        padding: small ? '5px 10px' : '9px 16px',
        borderRadius: 7, fontSize: small ? 11 : 13, fontWeight: 600,
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        opacity: (disabled || loading) ? 0.55 : 1,
        whiteSpace: 'nowrap', fontFamily: 'inherit',
        width: fullWidth ? '100%' : undefined,
      }}
    >
      {loading ? '⏳ …' : children}
    </button>
  );
}

function CopyBtn({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const doCopy = useCallback(() => {
    const fallback = () => {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      } catch { /* silent */ }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(fallback);
    } else {
      fallback();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [text]);
  return <Btn onClick={doCopy} variant="ghost" small>{copied ? '✅ Copied' : `📋 ${label}`}</Btn>;
}

function CreditBadge({ cost, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 10 }}>
      ⚡ {cost} cr{label ? ` · ${label}` : ''}
    </span>
  );
}

function SectionHead({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', ...style }}>
      {children}
    </div>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function statusColor(s) {
  if (s === DRAFT_STATUS.POSTED) return C.success;
  if (s === DRAFT_STATUS.READY)  return C.warn;
  return C.muted;
}
function statusEmoji(s) {
  if (s === DRAFT_STATUS.POSTED) return '✅';
  if (s === DRAFT_STATUS.READY)  return '🟡';
  return '📝';
}

// ─── Default form inputs ──────────────────────────────────────────────────────
function defaultInputs() {
  return {
    platform: 'facebook',
    tone: '', cta: '', extraNotes: '',
    // Aunt B's
    serviceType: '', serviceArea: '', offer: '', dateRange: '', cleaningTopic: '',
    // SLAI
    productArea: '', updateType: '', currentStatus: '',
    whatChanged: '', notLiveYet: '', targetAudience: '', ctaQuestion: '',
  };
}

// ─── Brand-specific form sections ─────────────────────────────────────────────
function AuntBsFields({ inputs, set }) {
  return (
    <>
      <div style={{ marginBottom: 10 }}><Label>Service type</Label>
        <FieldInput value={inputs.serviceType} onChange={e => set('serviceType', e.target.value)} placeholder="e.g. deep clean, move-out clean" />
      </div>
      <div style={{ marginBottom: 10 }}><Label>Service area</Label>
        <FieldInput value={inputs.serviceArea} onChange={e => set('serviceArea', e.target.value)} placeholder="e.g. Bolivar, MO" />
      </div>
      <div style={{ marginBottom: 10 }}><Label>Offer or details</Label>
        <FieldInput value={inputs.offer} onChange={e => set('offer', e.target.value)} placeholder="e.g. 15% off first clean" />
      </div>
      <div style={{ marginBottom: 10 }}><Label>Date range or season</Label>
        <FieldInput value={inputs.dateRange} onChange={e => set('dateRange', e.target.value)} placeholder="e.g. July, back-to-school" />
      </div>
      <div style={{ marginBottom: 10 }}><Label>Cleaning topic / result highlight</Label>
        <FieldInput value={inputs.cleaningTopic} onChange={e => set('cleaningTopic', e.target.value)} placeholder="e.g. spotless kitchen, fresh carpets" />
      </div>
    </>
  );
}

function SlaiFields({ inputs, set }) {
  return (
    <>
      <div style={{ marginBottom: 10 }}><Label>Product area</Label>
        <FieldInput value={inputs.productArea} onChange={e => set('productArea', e.target.value)} placeholder="e.g. ServicesOS, Field Mode" />
      </div>
      <div style={{ marginBottom: 10 }}><Label>Update type</Label>
        <FieldInput value={inputs.updateType} onChange={e => set('updateType', e.target.value)} placeholder="e.g. milestone, feature live, in progress" />
      </div>
      <div style={{ marginBottom: 10 }}><Label>Current status</Label>
        <FieldInput value={inputs.currentStatus} onChange={e => set('currentStatus', e.target.value)} placeholder="e.g. wife-beta testing underway" />
      </div>
      <div style={{ marginBottom: 10 }}><Label>What changed / what was built</Label>
        <FieldInput value={inputs.whatChanged} onChange={e => set('whatChanged', e.target.value)} placeholder="e.g. Customers CRUD, Field Mode read-only" multiline rows={2} />
      </div>
      <div style={{ marginBottom: 10 }}><Label>What is NOT live yet</Label>
        <FieldInput value={inputs.notLiveYet} onChange={e => set('notLiveYet', e.target.value)} placeholder="e.g. Bookings, multi-tenant billing" />
      </div>
      <div style={{ marginBottom: 10 }}><Label>Target audience</Label>
        <FieldInput value={inputs.targetAudience} onChange={e => set('targetAudience', e.target.value)} placeholder="e.g. small biz owners, founders" />
      </div>
      <div style={{ marginBottom: 10 }}><Label>CTA or discussion question</Label>
        <FieldInput value={inputs.ctaQuestion} onChange={e => set('ctaQuestion', e.target.value)} placeholder="e.g. What does your scheduling workflow look like?" />
      </div>
    </>
  );
}

// ─── Draft preview panel ──────────────────────────────────────────────────────
function DraftPreview({ draft, onRegenCaption, onRegenImagePrompt, onSaveNew, onUpdateCurrent, onMarkReady, onMarkPosted, loading, activeDraftId }) {
  if (!draft.fullCaption) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 260, textAlign: 'center', color: C.muted, padding: 24 }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>✍️</div>
        <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>No draft yet</div>
        <div style={{ fontSize: 13 }}>Fill in the form and click <strong>Generate Draft</strong>.</div>
      </div>
    );
  }

  const isPosted = draft.status === DRAFT_STATUS.POSTED;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{draft.title}</div>
          <div style={{ fontSize: 12, color: statusColor(draft.status), fontWeight: 600, marginTop: 3 }}>
            {statusEmoji(draft.status)} {draft.status.toUpperCase()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!isPosted && draft.status !== DRAFT_STATUS.READY &&
            <Btn onClick={onMarkReady} variant="warn" small>🟡 Mark ready</Btn>}
          {draft.status === DRAFT_STATUS.READY &&
            <Btn onClick={onMarkPosted} variant="success" small>✅ Mark posted</Btn>}
          {activeDraftId
            ? <Btn onClick={onUpdateCurrent} variant="secondary" small>💾 Update draft</Btn>
            : <Btn onClick={onSaveNew} variant="secondary" small>💾 Save as new</Btn>
          }
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, background: '#f3f4f6', color: C.muted, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
          📝 Placeholder (Phase 0)
        </span>
        {draft.creditsEstimated > 0 &&
          <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
            ⚡ ~{draft.creditsEstimated} cr estimated (not deducted)
          </span>
        }
      </div>

      {/* Full caption */}
      <div style={{ background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Full caption</span>
          <CopyBtn text={draft.fullCaption} />
        </div>
        <pre style={{ margin: 0, fontSize: 13, color: C.text, whiteSpace: 'pre-wrap', lineHeight: 1.65, fontFamily: 'inherit' }}>
          {draft.fullCaption}
        </pre>
      </div>

      {/* Short caption */}
      <div style={{ background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Short caption</span>
          <CopyBtn text={draft.shortCaption} />
        </div>
        <div style={{ fontSize: 13, color: C.text }}>{draft.shortCaption}</div>
      </div>

      {/* CTA + Hashtags */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>CTA</div>
          <div style={{ fontSize: 13, color: C.text, marginBottom: 8, lineHeight: 1.5 }}>{draft.callToAction}</div>
          <CopyBtn text={draft.callToAction} label="Copy CTA" />
        </div>
        <div style={{ background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Hashtags</div>
          <div style={{ fontSize: 12, color: '#6366f1', lineHeight: 1.6, marginBottom: 8 }}>{draft.hashtags}</div>
          <CopyBtn text={draft.hashtags} label="Copy tags" />
        </div>
      </div>

      {/* Image prompt */}
      <div style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#6b21a8' }}>🎨 Image prompt</span>
          <CopyBtn text={draft.imagePrompt} label="Copy prompt" />
        </div>
        <div style={{ fontSize: 12, color: C.purple, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 10 }}>{draft.imagePrompt}</div>
        <div style={{ padding: '7px 10px', background: '#f3e8ff', borderRadius: 6, fontSize: 11, color: '#6b21a8' }}>
          ⚡ Generating an image costs ~{CREDIT_COSTS.generate_image} credits. Use this prompt in Midjourney, DALL·E, Firefly, etc. — no image API is called here.
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
        <Btn onClick={onRegenCaption} variant="secondary" disabled={loading || isPosted}>
          🔄 Regen caption <CreditBadge cost={CREDIT_COSTS.regenerate_caption} />
        </Btn>
        <Btn onClick={onRegenImagePrompt} variant="ghost" disabled={loading || isPosted}>
          🎨 New image prompt <CreditBadge cost={CREDIT_COSTS.generate_image_prompt} />
        </Btn>
      </div>

      <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>
        Phase 0: drafts saved to localStorage. TODO Phase 1 → tenants/&#x7B;tenantId&#x7D;/growthAIDrafts/&#x7B;draftId&#x7D;
      </div>
    </div>
  );
}

// ─── Draft library ────────────────────────────────────────────────────────────
function DraftLibrary({ drafts, activeDraftId, onLoad, onDuplicate, onDelete, onMarkReady, onMarkPosted }) {
  const [filter, setFilter] = useState('all');

  const visible = filter === 'all' ? drafts : drafts.filter(d => d.status === filter);

  const brandName = key => BRANDS[key]?.name || key;

  const rel = iso => {
    if (!iso) return '';
    try {
      const now = new Date();
      const diff = now - new Date(iso);
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch { return ''; }
  };

  return (
    <Card style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <SectionHead>💾 Draft Library ({drafts.length})</SectionHead>
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', 'draft', 'ready', 'posted'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filter === f ? C.accent : C.border}`, background: filter === f ? '#eff6ff' : 'transparent', color: filter === f ? C.accent : C.muted }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && (
        <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: '18px 0' }}>
          {drafts.length === 0 ? 'No saved drafts yet. Generate and save one above.' : `No ${filter} drafts.`}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(d => (
          <div key={d.id}
            style={{ padding: '11px 14px', border: `1px solid ${d.id === activeDraftId ? C.accent : C.border}`, borderRadius: 9, background: d.id === activeDraftId ? '#eff6ff' : '#fafafa', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {statusEmoji(d.status)} {d.title}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {brandName(d.brandKey)} · {d.postTypeId} · {d.platform} · ⚡~{d.creditsEstimated}cr
                  {d.imagePrompt ? ' · 🎨' : ''}
                  {' · '}{rel(d.updatedAt)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <Btn onClick={() => onLoad(d)} variant={d.id === activeDraftId ? 'secondary' : 'ghost'} small>
                  {d.id === activeDraftId ? '✓ Active' : 'Load'}
                </Btn>
                <CopyBtn text={d.fullCaption} label="Caption" />
                <Btn onClick={() => onDuplicate(d.id)} variant="ghost" small>📋 Dup</Btn>
                {d.status !== DRAFT_STATUS.POSTED && d.status !== DRAFT_STATUS.READY &&
                  <Btn onClick={() => onMarkReady(d.id)} variant="ghost" small>🟡 Ready</Btn>}
                {d.status === DRAFT_STATUS.READY &&
                  <Btn onClick={() => onMarkPosted(d.id)} variant="ghost" small>✅ Posted</Btn>}
                <Btn onClick={() => onDelete(d.id)} variant="danger" small>🗑</Btn>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Content ideas panel ──────────────────────────────────────────────────────
function ContentIdeas({ brandKey, onApplyIdea }) {
  const ideas = CONTENT_IDEAS[brandKey] || [];
  return (
    <Card>
      <SectionHead>💡 Content ideas (static — no AI call)</SectionHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ideas.map((idea, i) => (
          <button key={i}
            onClick={() => onApplyIdea(idea)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: '#fafafa', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
            <span style={{ fontSize: 18 }}>{idea.emoji}</span>
            <span style={{ fontSize: 13, color: C.text }}>{idea.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: C.muted }}>prefill →</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 10, fontStyle: 'italic' }}>
        Clicking an idea prefills fields only — it does not auto-generate or call any API.
      </div>
    </Card>
  );
}

function CustomerResponseHelper({ brandKey, onSaveResponseDraft }) {
  const scenarios = RESPONSE_SCENARIOS[brandKey] || RESPONSE_SCENARIOS.auntbs;
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id || '');
  const [channelId, setChannelId] = useState('sms');

  const activeScenario = scenarios.find(item => item.id === scenarioId) || scenarios[0];
  const responseTemplate = buildResponseTemplate({
    brandKey,
    scenarioId: activeScenario?.id,
    channelId,
  });

  return (
    <Card>
      <SectionHead>Customer response draft helper</SectionHead>
      <div style={{ padding: '10px 12px', background: '#eff6ff', border: `1px solid ${C.border}`, borderRadius: 8, color: '#1e40af', fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
        Response drafts are local templates only. Nothing is sent automatically. Review and edit before sending.
      </div>
      <div style={{ marginBottom: 10 }}>
        <Label>Response scenario</Label>
        <FieldSelect
          ariaLabel="Response scenario"
          value={scenarioId}
          onChange={e => setScenarioId(e.target.value)}
          options={scenarios.map(item => ({ value: item.id, label: item.scenario }))}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <Label>Channel</Label>
        <FieldSelect
          ariaLabel="Response channel"
          value={channelId}
          onChange={e => setChannelId(e.target.value)}
          options={RESPONSE_CHANNELS.map(channel => ({ value: channel.id, label: channel.label }))}
        />
      </div>
      <div style={{ background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{responseTemplate.title}</div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
              {responseTemplate.scenario} · {responseTemplate.channel} · {responseTemplate.tone}
            </div>
          </div>
          <CreditBadge cost={responseTemplate.estimatedCredits} label="estimated" />
        </div>
        {responseTemplate.subjectLine && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Subject</div>
            <div style={{ fontSize: 13, color: C.text }}>{responseTemplate.subjectLine}</div>
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Message</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: C.text, lineHeight: 1.6 }}>
          {responseTemplate.messageTemplate}
        </pre>
      </div>
      <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.5, marginBottom: 12 }}>{responseTemplate.notes}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <CopyBtn text={responseTemplate.messageTemplate} label="Copy response" />
        <Btn onClick={() => onSaveResponseDraft(responseTemplate)} variant="secondary" small>
          💾 Save response draft
        </Btn>
      </div>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function GrowthAIPage() {
  // Brand + post type selection
  const [brandKey, setBrandKey]         = useState('auntbs');
  const [postTypeId, setPostTypeId]     = useState('');

  // Form inputs
  const [inputs, setInputs]             = useState(defaultInputs);

  // Active draft (what's shown in the preview panel)
  const [activeDraft, setActiveDraft]   = useState({
    title: '', fullCaption: '', shortCaption: '', callToAction: '',
    hashtags: '', imagePrompt: '', status: 'draft', creditsEstimated: 0,
  });
  const [activeDraftId, setActiveDraftId] = useState(null); // id of loaded saved draft, if any

  // Saved draft library — initialised from localStorage once on mount.
  // Using the useState initializer form avoids calling setState inside an effect.
  const [drafts, setDrafts] = useState(() => loadDrafts());

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const brand    = BRANDS[brandKey];
  const postType = brand.postTypes.find(p => p.id === postTypeId) || null;

  // Reset post type and inputs when brand changes
  const handleBrandChange = useCallback((key) => {
    setBrandKey(key);
    setPostTypeId('');
    setInputs(defaultInputs());
    setActiveDraftId(null);
    setError('');
  }, []);

  const setInput = useCallback((field, value) => {
    setInputs(prev => ({ ...prev, [field]: value }));
  }, []);

  // ── Generate draft ──
  const handleGenerate = useCallback(() => {
    if (!postType) { setError('Select a post type first.'); return; }
    setLoading(true);
    setError('');
    try {
      const { generated, creditsEstimated } = generateDraft(brand, postType, inputs);
      setActiveDraft({
        title:            generated.title,
        fullCaption:      generated.fullCaption,
        shortCaption:     generated.shortCaption,
        callToAction:     generated.callToAction,
        hashtags:         generated.hashtags,
        imagePrompt:      generated.imagePrompt,
        status:           'draft',
        creditsEstimated,
      });
      setActiveDraftId(null); // new generation = not yet linked to a saved draft
    } catch (err) {
      setError(`Generation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [brand, postType, inputs]);

  // ── Regenerate caption ──
  const handleRegenCaption = useCallback(() => {
    if (!postType || !activeDraft.fullCaption) return;
    setLoading(true);
    setError('');
    try {
      const { generated, creditsEstimated } = regenerateCaption(brand, postType, inputs);
      setActiveDraft(prev => {
        const updated = { ...prev, fullCaption: generated.fullCaption, shortCaption: generated.shortCaption, callToAction: generated.callToAction, hashtags: generated.hashtags, creditsEstimated: prev.creditsEstimated + creditsEstimated };
        // If this was linked to a saved draft, update the generation events but not auto-save
        if (activeDraftId) {
          setDrafts(current => {
            const patched = current.map(d => d.id === activeDraftId ? addGenerationEvent(d, 'regenerate_caption') : d);
            return patched;
          });
        }
        return updated;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [brand, postType, inputs, activeDraft.fullCaption, activeDraftId]);

  // ── Regenerate image prompt ──
  const handleRegenImagePrompt = useCallback(() => {
    if (!postType) return;
    setLoading(true);
    setError('');
    try {
      const { imagePrompt } = generateImagePromptOnly(brand, postType, inputs);
      setActiveDraft(prev => ({ ...prev, imagePrompt }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [brand, postType, inputs]);

  // ── Save as new draft ──
  const handleSaveNew = useCallback(() => {
    if (!activeDraft.fullCaption) return;
    const record = createDraftRecord({
      brandKey, postTypeId: postTypeId || '', platform: inputs.platform,
      title: activeDraft.title, inputSnapshot: { ...inputs },
      generated: activeDraft, creditsEstimated: activeDraft.creditsEstimated,
    });
    const updated = insertDraft(drafts, record);
    setDrafts(updated);
    setActiveDraftId(record.id);
  }, [activeDraft, brandKey, postTypeId, inputs, drafts]);

  const handleSaveResponseDraft = useCallback((responseTemplate) => {
    const generated = {
      fullCaption: responseTemplate.messageTemplate,
      shortCaption: responseTemplate.subjectLine || responseTemplate.messageTemplate.slice(0, 140),
      callToAction: 'Review and send manually',
      hashtags: '',
      imagePrompt: '',
    };
    const record = createDraftRecord({
      brandKey: responseTemplate.brand,
      postTypeId: 'customer-response',
      platform: responseTemplate.channel,
      title: `[Customer response] ${responseTemplate.title}`,
      inputSnapshot: {
        draftKind: 'customer_response',
        responseTemplateId: responseTemplate.id,
        responseScenario: responseTemplate.scenario,
        responseChannel: responseTemplate.channel,
        responseTone: responseTemplate.tone,
        responseNotes: responseTemplate.notes,
        responseSubjectLine: responseTemplate.subjectLine,
      },
      generated,
      creditsEstimated: responseTemplate.estimatedCredits,
    });
    const updated = insertDraft(drafts, record);
    setDrafts(updated);
    setActiveDraft({
      title: record.title,
      fullCaption: record.fullCaption,
      shortCaption: record.shortCaption,
      callToAction: record.callToAction,
      hashtags: record.hashtags,
      imagePrompt: record.imagePrompt,
      status: record.status,
      creditsEstimated: record.creditsEstimated,
    });
    setActiveDraftId(record.id);
  }, [drafts]);

  // ── Update current draft ──
  const handleUpdateCurrent = useCallback(() => {
    if (!activeDraftId || !activeDraft.fullCaption) return;
    setDrafts(current => {
      const existing = current.find(d => d.id === activeDraftId);
      if (!existing) return current;
      const patched = updateDraftRecord(existing, {
        fullCaption: activeDraft.fullCaption, shortCaption: activeDraft.shortCaption,
        callToAction: activeDraft.callToAction, hashtags: activeDraft.hashtags,
        imagePrompt: activeDraft.imagePrompt, title: activeDraft.title,
        status: activeDraft.status, creditsEstimated: activeDraft.creditsEstimated,
      });
      return upsertDraft(current, patched);
    });
  }, [activeDraftId, activeDraft]);

  // ── In-preview status changes ──
  const handleMarkReady  = useCallback(() => setActiveDraft(prev => ({ ...prev, status: DRAFT_STATUS.READY  })), []);
  const handleMarkPosted = useCallback(() => setActiveDraft(prev => ({ ...prev, status: DRAFT_STATUS.POSTED })), []);

  // ── Library actions ──
  const handleLoadDraft = useCallback((d) => {
    setActiveDraft({
      title: d.title, fullCaption: d.fullCaption, shortCaption: d.shortCaption,
      callToAction: d.callToAction, hashtags: d.hashtags, imagePrompt: d.imagePrompt,
      status: d.status, creditsEstimated: d.creditsEstimated,
    });
    setActiveDraftId(d.id);
    setBrandKey(d.brandKey || 'auntbs');
    setPostTypeId(d.postTypeId || '');
    if (d.inputSnapshot) setInputs({ ...defaultInputs(), ...d.inputSnapshot });
    setError('');
  }, []);

  const handleDuplicate = useCallback((id) => {
    setDrafts(current => duplicateDraft(current, id));
  }, []);

  const handleDelete = useCallback((id) => {
    setDrafts(current => removeDraft(current, id));
    if (activeDraftId === id) setActiveDraftId(null);
  }, [activeDraftId]);

  const handleLibraryMarkReady  = useCallback((id) => setDrafts(current => patchDraftStatus(current, id, DRAFT_STATUS.READY )), []);
  const handleLibraryMarkPosted = useCallback((id) => setDrafts(current => patchDraftStatus(current, id, DRAFT_STATUS.POSTED)), []);

  // ── Content idea prefill ──
  const handleApplyIdea = useCallback((idea) => {
    const { postTypeId: pt, inputs: prefill } = idea.prefill;
    if (pt) setPostTypeId(pt);
    if (prefill) setInputs(prev => ({ ...prev, ...prefill }));
    setError('');
    // Does NOT auto-generate. User must click Generate.
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>

      {/* ── Phase 0 honesty banner ─────────────────────────────────── */}
      <div style={{ background: '#fefce8', borderBottom: '1px solid #fde047', padding: '10px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#713f12' }}>⚠️ Internal Phase 0 shell</span>
          <span style={{ fontSize: 12, color: '#854d0e' }}>Phase 0 local helper. Drafts, templates, and content packs are saved or generated locally in this browser. No real AI calls, posting, or credit deduction yet. Super-admin only.</span>
        </div>
      </div>

      {/* ── Page header ───────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#312e81 100%)', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>🚀 GrowthAI — Marketing Helper</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#a5b4fc' }}>Phase 0 · AI drafts (placeholder) · Human approves · Human posts</p>
        </div>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', display: 'grid', gridTemplateColumns: 'minmax(0,400px) 1fr', gap: 20, alignItems: 'start' }}>

        {/* LEFT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 1. Brand selector */}
          <Card>
            <SectionHead>1. Choose brand</SectionHead>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.values(BRANDS).map(b => (
                <button key={b.key} onClick={() => handleBrandChange(b.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 9, cursor: 'pointer', border: brandKey === b.key ? `2px solid ${C.accent}` : `1px solid ${C.border}`, background: brandKey === b.key ? '#eff6ff' : '#f9fafb', textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 22 }}>{b.emoji}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{b.tone}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* 2. Post type */}
          <Card>
            <SectionHead>2. Choose post type</SectionHead>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {brand.postTypes.map(pt => (
                <button key={pt.id} onClick={() => setPostTypeId(pt.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 7, cursor: 'pointer', border: postTypeId === pt.id ? `2px solid ${C.accent}` : `1px solid ${C.border}`, background: postTypeId === pt.id ? '#eff6ff' : 'transparent', textAlign: 'left', fontFamily: 'inherit' }}>
                  <span>{pt.emoji}</span>
                  <span style={{ fontSize: 13, color: C.text, fontWeight: postTypeId === pt.id ? 600 : 400 }}>{pt.label}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* 3. Form inputs */}
          <Card>
            <SectionHead>3. Fill in details</SectionHead>
            <div style={{ marginBottom: 10 }}>
              <Label required>Platform</Label>
              <FieldSelect value={inputs.platform} onChange={e => setInput('platform', e.target.value)}
                options={PLATFORMS.map(p => ({ value: p.id, label: `${p.label} (≤${p.maxChars} chars)` }))} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <Label>Tone override</Label>
              <FieldInput value={inputs.tone} onChange={e => setInput('tone', e.target.value)} placeholder={`Default: ${brand.tone}`} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <Label>CTA override</Label>
              <FieldInput value={inputs.cta} onChange={e => setInput('cta', e.target.value)} placeholder={brand.defaultCTA} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <Label>Extra notes</Label>
              <FieldInput value={inputs.extraNotes} onChange={e => setInput('extraNotes', e.target.value)} placeholder="Any angle, event, or detail to include" multiline rows={2} />
            </div>
            {brandKey === 'auntbs'
              ? <AuntBsFields inputs={inputs} set={setInput} />
              : <SlaiFields inputs={inputs} set={setInput} />
            }
          </Card>

          {/* 4. Generate button */}
          <Card>
            {!postType && <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Select a post type above to enable generation.</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <Btn onClick={handleGenerate} disabled={!postType} loading={loading} fullWidth={false}>
                ✨ Generate Draft
              </Btn>
              <CreditBadge cost={CREDIT_COSTS.generate_caption} label="estimated" />
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>
              Phase 0: estimated credits only — no deduction. TODO: server-side atomic deduction in Phase 1.
            </div>
            {error && (
              <div style={{ marginTop: 10, padding: '9px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 7, fontSize: 13, color: C.error }}>
                ⚠️ {error}
              </div>
            )}
          </Card>

          {/* 5. Content ideas */}
          <ContentIdeas brandKey={brandKey} onApplyIdea={handleApplyIdea} />

          <CustomerResponseHelper key={brandKey} brandKey={brandKey} onSaveResponseDraft={handleSaveResponseDraft} />
        </div>

        {/* RIGHT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Card>
            <SectionHead>Draft Preview</SectionHead>
            <DraftPreview
              draft={activeDraft}
              onRegenCaption={handleRegenCaption}
              onRegenImagePrompt={handleRegenImagePrompt}
              onSaveNew={handleSaveNew}
              onUpdateCurrent={handleUpdateCurrent}
              onMarkReady={handleMarkReady}
              onMarkPosted={handleMarkPosted}
              loading={loading}
              activeDraftId={activeDraftId}
            />
          </Card>

          <DraftLibrary
            drafts={drafts}
            activeDraftId={activeDraftId}
            onLoad={handleLoadDraft}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onMarkReady={handleLibraryMarkReady}
            onMarkPosted={handleLibraryMarkPosted}
          />
        </div>
      </div>
    </div>
  );
}
