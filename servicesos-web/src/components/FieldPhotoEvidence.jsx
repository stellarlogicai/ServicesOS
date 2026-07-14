import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FIELD_PHOTO_PHASES,
  listFieldPhotos,
  loadFieldPhotoBlob,
  uploadFieldPhoto,
  validateFieldPhoto,
} from '../services/fieldPhotoService';
import './FieldPhotoEvidence.css';

const PHASE_COPY = Object.freeze({
  before: {
    title: 'Before photos',
    addLabel: 'Add before photo',
    empty: 'No before photos added yet.',
  },
  after: {
    title: 'After photos',
    addLabel: 'Add after photo',
    empty: 'No after photos added yet.',
  },
});

function photoTimestamp(value) {
  const date = typeof value?.toDate === 'function'
    ? value.toDate()
    : value instanceof Date
      ? value
      : value
        ? new Date(value)
        : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Upload time unavailable';
}

function PersistedPhoto({ photo }) {
  const [source, setSource] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    loadFieldPhotoBlob(photo.storagePath)
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.storagePath]);

  return (
    <article className="field-photo-card">
      {source && <img src={source} alt={`${photo.phase} job evidence`} />}
      {!source && !unavailable && <div className="field-photo-placeholder" role="status">Loading photo...</div>}
      {unavailable && <div className="field-photo-placeholder" role="status">Photo unavailable.</div>}
      <p>Uploaded {photoTimestamp(photo.uploadedAt)}</p>
    </article>
  );
}

function PhotoGrid({ phase, photos }) {
  const matchingPhotos = photos.filter(photo => photo.phase === phase);
  if (!matchingPhotos.length) {
    return <p className="field-photo-empty">{PHASE_COPY[phase].empty}</p>;
  }
  return (
    <div className="field-photo-grid">
      {matchingPhotos.map(photo => <PersistedPhoto key={photo.id} photo={photo} />)}
    </div>
  );
}

function PendingPhoto({ pending, phase, onRemove, onUpload }) {
  const [previewUrl] = useState(() => pending?.file ? URL.createObjectURL(pending.file) : '');

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!pending) return null;
  const uploading = pending.status === 'uploading';
  const failed = pending.status === 'failed';

  return (
    <div className="field-photo-pending">
      {previewUrl && <img src={previewUrl} alt={`Selected ${phase} photo preview`} />}
      <div>
        <p role="status">
          {uploading ? 'Uploading photo...' : failed ? 'Upload failed. Try again.' : 'Photo ready to upload.'}
        </p>
        <div className="field-photo-pending-actions">
          <button className="v1-button v1-button-primary" type="button" onClick={onUpload} disabled={uploading}>
            {uploading ? 'Uploading...' : failed ? 'Retry upload' : 'Upload photo'}
          </button>
          <button className="v1-button v1-button-secondary" type="button" onClick={onRemove} disabled={uploading}>
            Remove selected photo
          </button>
        </div>
      </div>
    </div>
  );
}

export function FieldPhotoUploadPanel({ tenantId, bookingId, uploadedByUid, onEvidenceChange }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState({ before: null, after: null });
  const [phaseMessage, setPhaseMessage] = useState({ before: '', after: '' });

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const loaded = await listFieldPhotos(tenantId, bookingId);
      setPhotos(loaded);
      onEvidenceChange?.({ loading: false, photos: loaded });
    } catch {
      setPhotos([]);
      setLoadError('Photo evidence could not be loaded. Please try again.');
      onEvidenceChange?.({ loading: false, photos: [] });
    } finally {
      setLoading(false);
    }
  }, [bookingId, onEvidenceChange, tenantId]);

  useEffect(() => {
    Promise.resolve().then(() => {
      onEvidenceChange?.({ loading: true, photos: [] });
      return loadPhotos();
    });
  }, [loadPhotos, onEvidenceChange]);

  const selectFile = (phase, file) => {
    setPhaseMessage(current => ({ ...current, [phase]: '' }));
    const validation = validateFieldPhoto(file);
    if (!validation.success) {
      setPending(current => ({ ...current, [phase]: null }));
      setPhaseMessage(current => ({ ...current, [phase]: validation.message }));
      return;
    }
    setPending(current => ({ ...current, [phase]: { file, status: 'ready' } }));
  };

  const upload = async phase => {
    const selected = pending[phase];
    if (!selected?.file) return;
    setPending(current => ({ ...current, [phase]: { ...selected, status: 'uploading' } }));
    setPhaseMessage(current => ({ ...current, [phase]: '' }));
    const result = await uploadFieldPhoto({
      tenantId,
      bookingId,
      phase,
      file: selected.file,
      uploadedByUid,
    });
    if (!result.success) {
      setPending(current => ({ ...current, [phase]: { ...selected, status: 'failed' } }));
      return;
    }
    const updated = [...photos, result.data];
    setPhotos(updated);
    setPending(current => ({ ...current, [phase]: null }));
    setPhaseMessage(current => ({ ...current, [phase]: 'Photo uploaded.' }));
    onEvidenceChange?.({ loading: false, photos: updated });
  };

  return (
    <section className="field-photo-evidence" aria-labelledby="field-photo-upload-title">
      <div className="field-photo-section-heading">
        <h3 id="field-photo-upload-title">Field photos</h3>
        <p>Before and after photos are optional job evidence.</p>
      </div>
      {loading && <p role="status">Loading photo evidence...</p>}
      {loadError && <div className="field-photo-load-error" role="alert">{loadError}</div>}
      {FIELD_PHOTO_PHASES.map(phase => (
        <section className="field-photo-phase" aria-labelledby={`field-photo-${phase}-title`} key={phase}>
          <div className="field-photo-phase-header">
            <h4 id={`field-photo-${phase}-title`}>{PHASE_COPY[phase].title}</h4>
            <label className="v1-button v1-button-secondary field-photo-file-label">
              {PHASE_COPY[phase].addLabel}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) selectFile(phase, file);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
          {!loading && <PhotoGrid phase={phase} photos={photos} />}
          <PendingPhoto
            key={pending[phase]?.file ? `${phase}-${pending[phase].file.name}-${pending[phase].file.lastModified}` : `${phase}-empty`}
            pending={pending[phase]}
            phase={phase}
            onRemove={() => setPending(current => ({ ...current, [phase]: null }))}
            onUpload={() => upload(phase)}
          />
          {phaseMessage[phase] && (
            <p className={phaseMessage[phase] === 'Photo uploaded.' ? 'field-photo-success' : 'field-photo-error'} role={phaseMessage[phase] === 'Photo uploaded.' ? 'status' : 'alert'}>
              {phaseMessage[phase]}
            </p>
          )}
        </section>
      ))}
    </section>
  );
}

export function BookingFieldPhotoReview({ tenantId, bookingId }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => {
        if (active) {
          setLoading(true);
          setError('');
        }
        return listFieldPhotos(tenantId, bookingId);
      })
      .then(items => {
        if (active) setPhotos(items);
      })
      .catch(() => {
        if (active) setError('Field photos could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [bookingId, tenantId]);

  const grouped = useMemo(() => ({
    before: photos.filter(photo => photo.phase === 'before'),
    after: photos.filter(photo => photo.phase === 'after'),
  }), [photos]);

  return (
    <section className="field-photo-review" aria-labelledby="booking-field-photo-title">
      <h3 id="booking-field-photo-title">Field photos</h3>
      <p>Read-only photo evidence uploaded from Field Mode.</p>
      {loading && <p role="status">Loading field photos...</p>}
      {error && <div className="field-photo-load-error" role="alert">{error}</div>}
      {!loading && FIELD_PHOTO_PHASES.map(phase => (
        <section className="field-photo-phase" aria-labelledby={`booking-field-photo-${phase}`} key={phase}>
          <h4 id={`booking-field-photo-${phase}`}>{PHASE_COPY[phase].title}</h4>
          <PhotoGrid phase={phase} photos={grouped[phase]} />
        </section>
      ))}
    </section>
  );
}
