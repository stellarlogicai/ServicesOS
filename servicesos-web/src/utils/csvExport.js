function isoDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (value && typeof value.toDate === 'function') {
    try {
      return isoDate(value.toDate());
    } catch {
      return null;
    }
  }

  if (value && typeof value === 'object' && Number.isFinite(value.seconds)) {
    const milliseconds = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1_000_000);
    return isoDate(new Date(milliseconds));
  }

  return null;
}

function jsonValue(value) {
  try {
    return JSON.stringify(value, (_key, nestedValue) => isoDate(nestedValue) || nestedValue);
  } catch {
    return 'Unserializable value';
  }
}

export function csvValue(value) {
  if (value === null || value === undefined) return '';

  const date = isoDate(value);
  if (date) return date;

  if (typeof value === 'object') return jsonValue(value);
  return String(value);
}

export function escapeCsvValue(value) {
  const normalized = csvValue(value);
  return /[",\r\n]/.test(normalized)
    ? `"${normalized.replace(/"/g, '""')}"`
    : normalized;
}

export function createCsv(columns, rows) {
  const header = columns.map(column => escapeCsvValue(column.label)).join(',');
  const lines = rows.map(row => (
    columns.map(column => escapeCsvValue(row[column.key])).join(',')
  ));
  return [header, ...lines].join('\r\n');
}

export function csvFileName(prefix, now = new Date()) {
  const date = isoDate(now)?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `servicesos-${prefix}-${date}.csv`;
}

export function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  try {
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
