import { formatLocalDateInputValue } from '../utils/dateOnly';

const commercialFields = [
  ['businessName', 'Business name *'],
  ['primaryContactName', 'Primary contact name *'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['serviceAddress', 'Service address *'],
  ['facilityType', 'Facility type'],
  ['approximateSquareFootage', 'Approximate square footage', 'number'],
  ['areasToClean', 'Areas to clean', 'textarea'],
  ['numberOfRestrooms', 'Number of restrooms', 'number'],
  ['frequency', 'Frequency'],
  ['preferredServiceWindow', 'Preferred service window'],
  ['operatingHours', 'Operating hours', 'textarea'],
  ['accessSecurityInstructions', 'Access / security instructions', 'textarea'],
  ['knownHazards', 'Known hazards', 'textarea'],
  ['specialSurfacesMaterials', 'Special surfaces / materials', 'textarea'],
  ['suppliesEquipmentNotes', 'Supplies / equipment notes', 'textarea'],
  ['generalNotes', 'General notes', 'textarea'],
];

export default function BookingIntakeFields({ form, onChange, idPrefix = 'booking' }) {
  const field = (name, label, type = 'text') => (
    <label className="create-booking-field" key={name} htmlFor={`${idPrefix}-${name}`}>
      <span>{label}</span>
      {type === 'textarea' ? (
        <textarea id={`${idPrefix}-${name}`} name={`commercialDetails.${name}`} rows={3} value={form.commercialDetails[name]} onChange={onChange} />
      ) : (
        <input id={`${idPrefix}-${name}`} name={`commercialDetails.${name}`} type={type} min={type === 'number' ? '0' : undefined} value={form.commercialDetails[name]} onChange={onChange} />
      )}
    </label>
  );

  return <>
    <fieldset className="create-booking-type">
      <legend>Booking type *</legend>
      {['residential', 'commercial'].map(type => (
        <label key={type}>
          <input type="radio" name="bookingType" value={type} checked={form.bookingType === type} onChange={onChange} />
          <span>{type === 'residential' ? 'Residential' : 'Commercial'}</span>
        </label>
      ))}
    </fieldset>

    <section className="create-booking-section" aria-labelledby={`${idPrefix}-service-heading`}>
      <h2 id={`${idPrefix}-service-heading`}>Service and schedule</h2>
      <div className="create-booking-grid">
        <label className="create-booking-field"><span>Service type or job title *</span><input name="serviceType" value={form.serviceType} onChange={onChange} required /></label>
        <label className="create-booking-field"><span>Scheduled date *</span><input className="booking-date-time-field" type="date" name="date" min={formatLocalDateInputValue()} value={form.date} onChange={onChange} required /></label>
        <label className="create-booking-field"><span>Scheduled time *</span><input className="booking-date-time-field" type="time" name="startTime" value={form.startTime} onChange={onChange} required /></label>
        <label className="create-booking-field"><span>Approved price ($) *</span><input type="number" name="agreedPrice" min="0.01" step="0.01" value={form.agreedPrice} onChange={onChange} required /></label>
      </div>
      {form.bookingType === 'residential' && (
        <label className="create-booking-field create-booking-wide"><span>Service scope and notes</span><textarea name="notes" rows={3} value={form.notes} onChange={onChange} /></label>
      )}
    </section>

    {form.bookingType === 'commercial' && (
      <section className="create-booking-section" aria-labelledby={`${idPrefix}-commercial-heading`}>
        <h2 id={`${idPrefix}-commercial-heading`}>Commercial service details</h2>
        <div className="create-booking-grid">{commercialFields.map(args => field(...args))}</div>
      </section>
    )}
  </>;
}
