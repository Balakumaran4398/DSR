export type ReleaseDayTone = 'blue' | 'green' | 'red' | 'warning' |'amber'| 'none';

export interface ReleaseDayStatus {
  count: number | null;
  text: string;
  tone: ReleaseDayTone;
  status: string;
}

const firstDate = (source: any, keys: string[]): Date | null => {
  for (const key of keys) {
    const value = source?.[key];
    if (value === null || value === undefined || value === '') continue;
    const date = parseReleaseDay(value);
    if (date) return date;
  }
  return null;
};

export const parseReleaseDay = (value: any): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = `${value ?? ''}`.trim();
  const ymd = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  const dmy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s].*)?$/);
  if (ymd || dmy) {
    const year = Number(ymd ? ymd[1] : dmy![3]);
    const month = Number(ymd ? ymd[2] : dmy![2]);
    const day = Number(ymd ? ymd[3] : dmy![1]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  if (!text || text === '-') return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

const calendarDay = (date: Date): number => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

export function isReleaseInDateRange(release: any, rangeStart: any, rangeEnd: any): boolean {
  const selectedStart = parseReleaseDay(rangeStart);
  const selectedEnd = parseReleaseDay(rangeEnd);

  if (!selectedStart || !selectedEnd) return false;

  const firstSelectedDay = calendarDay(selectedStart);
  const lastSelectedDay = calendarDay(selectedEnd);
  const rangeMinimum = Math.min(firstSelectedDay, lastSelectedDay);
  const rangeMaximum = Math.max(firstSelectedDay, lastSelectedDay);
  const status = String(release?.status ?? '').trim().toLowerCase().replace(/[-_\s]+/g, '-');

  if (status === 'pass' || status === 'failed') {
    const closedDate = firstDate(release, ['closed_date', 'closedDate']);
    if (!closedDate) return false;

    const closedDay = calendarDay(closedDate);
    return closedDay >= rangeMinimum && closedDay <= rangeMaximum;
  }

  const plannedDate = firstDate(release, ['planned_date', 'plannedDate']);
  const releasedDate = firstDate(release, [
    'released_date', 'release_date', 'releaseDate', 'releasedDate',
    'scheduled_release_date', 'scheduledReleaseDate'
  ]);

  if (!plannedDate && !releasedDate) return false;

  const firstReleaseDay = calendarDay(plannedDate || releasedDate!);
  const lastReleaseDay = calendarDay(releasedDate || plannedDate!);

  return Math.min(firstReleaseDay, lastReleaseDay) <= rangeMaximum
    && Math.max(firstReleaseDay, lastReleaseDay) >= rangeMinimum;
}

const formatCalendarDay = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStatusHistoryTransition = (release: any, statusKey: string): Date | null => {
  const logs = release?.status_logs
    || release?.statusLogs
    || release?.activity_logs
    || release?.activityLogs
    || release?.logs;
  if (!Array.isArray(logs)) return null;

  const matchingTransitions = logs
    .map((log: any) => ({
      date: firstDate(log, ['logdate', 'created_date', 'createddate', 'updated_date', 'updateddate']),
      status: `${log?.status ?? ''}`.trim().toLowerCase().replace(/[-_\s]+/g, '-')
    }))
    .filter((entry: any) => entry.date && entry.status === statusKey)
    .sort((first: any, second: any) => calendarDay(second.date) - calendarDay(first.date));

  return matchingTransitions[0]?.date ?? null;
};

const getCurrentStatusDate = (release: any, statusKey: string): Date | null => {
  const statusSpecificKeys: Record<string, string[]> = {
    'in-progress': ['in_progress_date', 'inProgressDate'],
    'on-hold': ['on_hold_date', 'onHoldDate'],
    'to-be-tested': ['to_be_tested_date', 'toBeTestedDate', 'to_be_tested_at', 'toBeTestedAt'],
    pass: ['closed_date', 'closedDate'],
    failed: ['closed_date', 'closedDate']
  };

  return firstDate(release, statusSpecificKeys[statusKey] || [])
    || firstDate(release, [
      'status_changed_date',
      'statusChangedDate',
      'release_status_changed_date',
      'releaseStatusChangedDate'
    ])
    || getStatusHistoryTransition(release, statusKey)
    || firstDate(release, ['release_transition_date', 'releaseTransitionDate']);
};

export function getReleaseDayStatus(
  release: any,
  today = new Date()
): ReleaseDayStatus {
  const released = firstDate(release, [
    'released_date', 'release_date', 'releaseDate', 'releasedDate',
    'scheduled_release_date', 'scheduledReleaseDate'
  ]);
  const status = `${release?.status ?? ''}`.trim() || '-';
  const statusKey = status.toLowerCase().replace(/[-_\s]+/g, '-');
  const isUpcoming = statusKey === 'upcoming-release';

  if (isUpcoming) {
    const deadline = released || firstDate(release, ['planned_date', 'plannedDate']);
    if (!deadline) {
      return { count: null, text: '-', tone: 'none', status };
    }

    const daysRemaining = Math.round((calendarDay(deadline) - calendarDay(today)) / 86400000);
    const dateText = formatCalendarDay(deadline);
    if (daysRemaining < 0) {
      const count = Math.abs(daysRemaining);
      return {
        count,
        text: `${dateText} (${count})`,
        tone: 'red',
        status
      };
    }

    return {
      count: daysRemaining,
      text: `${dateText} (${daysRemaining})`,
      tone: 'warning',
      status
    };
  }

  // For non-Upcoming rows, calculate from the date the current status was set.
  // This keeps In-Progress, On-Hold, To-be-Tested, Pass and Failed distinct.
  const transition = getCurrentStatusDate(release, statusKey);
  // Some release records have a planned deadline but no released date yet.
  // Keep the Overdue column available for every status in that case.
  const deadline = released || firstDate(release, ['planned_date', 'plannedDate']);
  if (!deadline || !transition) {
    return { count: null, text: '-', tone: 'none', status };
  }

  const daysBeforeRelease = Math.round((calendarDay(deadline) - calendarDay(transition)) / 86400000);
  const transitionText = formatCalendarDay(transition);
  if (daysBeforeRelease === 0) {
    return { count: 0, text: `${transitionText} (0)`, tone: 'blue', status };
  }

  const count = Math.abs(daysBeforeRelease);
  const isEarly = daysBeforeRelease > 0;
  return {
    count,
    text: `${transitionText} (${count})`,
    tone: isEarly ? 'green' : 'red',
    status
  };
}
