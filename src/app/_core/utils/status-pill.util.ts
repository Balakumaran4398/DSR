export function formatStatusPill(value: any): string {
  const label = escapeStatusHtml(formatStatusLabel(value));
  const className = getStatusPillClass(value);

  return `
    <span class="app-status-pill ${className}" title="${label}">
      <span class="app-status-pill__dot"></span>
      <span class="app-status-pill__label">${label}</span>
    </span>
  `;
}

export function getStatusPillClass(value: any): string {
  return `app-status-pill--${getStatusPillTone(value)}`;
}

export function getStatusPillTone(value: any): string {
  if (value === true) {
    return 'open';
  }

  if (value === false) {
    return 'danger';
  }

  const status = normalizeStatus(value);

  if (!status || status === '-') {
    return 'muted';
  }

  if (['cancel', 'reject', 'failed', 'fail', 'inactive', 'deleted', 'relieved'].some(alias => status.includes(alias))) {
    return 'danger';
  }

  if (['hold', 'delayed', 'delay', 'blocked', 'to-be-tested', 'upcoming', 'upcomming'].some(alias => status.includes(alias))) {
    return 'warning';
  }

  if (['review', 'testing', 'tested', 'qa'].some(alias => status.includes(alias))) {
    return 'testing';
  }

  if (['progress', 'working', 'started', 'assigned', 'planning'].some(alias => status.includes(alias))) {
    return 'progress';
  }

  if (['approved', 'completed', 'complete', 'closed', 'resolved', 'done', 'passed', 'pass', 'invoiced'].some(alias => status.includes(alias))) {
    return 'success';
  }

  if (['open', 'active', 'new', 'pending', 'todo', 'to-do'].some(alias => status.includes(alias))) {
    return 'open';
  }

  return 'muted';
}

export function formatStatusLabel(value: any): string {
  if (value === true) {
    return 'Active';
  }

  if (value === false) {
    return 'Inactive';
  }

  const label = `${value ?? ''}`.trim();
  return label || '-';
}

export function normalizeStatus(value: any): string {
  return `${value ?? ''}`.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function escapeStatusHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
