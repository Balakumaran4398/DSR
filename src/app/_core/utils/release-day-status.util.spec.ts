import { getReleaseDayStatus, isReleaseInDateRange } from './release-day-status.util';

describe('isReleaseInDateRange', () => {
  const startDate = '2026-09-07';
  const endDate = '2026-09-13';

  it('filters Pass and Failed releases by closed date only', () => {
    expect(isReleaseInDateRange({
      status: 'Pass',
      planned_date: '2026-08-01',
      released_date: '2026-08-10',
      closed_date: '2026-09-07'
    }, startDate, endDate)).toBeTrue();
    expect(isReleaseInDateRange({
      status: 'Failed',
      planned_date: '2026-09-08',
      released_date: '2026-09-10',
      closedDate: '2026-09-14'
    }, startDate, endDate)).toBeFalse();
  });

  it('includes both closed-date boundaries and rejects missing or invalid closed dates', () => {
    expect(isReleaseInDateRange({ status: 'pass', closed_date: startDate }, startDate, endDate)).toBeTrue();
    expect(isReleaseInDateRange({ status: 'FAILED', closedDate: endDate }, startDate, endDate)).toBeTrue();
    expect(isReleaseInDateRange({ status: 'Pass', released_date: '2026-09-10' }, startDate, endDate)).toBeFalse();
    expect(isReleaseInDateRange({ status: 'Failed', closed_date: '2026-02-30' }, startDate, endDate)).toBeFalse();
  });

  it('keeps interval-overlap filtering for every other status', () => {
    ['Upcoming-Release', 'In-Progress', 'On-Hold', 'To-be-Tested', 'Rejected'].forEach(status => {
      expect(isReleaseInDateRange({
        status,
        planned_date: '2026-09-01',
        released_date: '2026-09-18'
      }, startDate, endDate)).withContext(status).toBeTrue();
    });
  });
});


describe('getReleaseDayStatus', () => {
  const today = new Date(2026, 8, 22);

  it('keeps Upcoming live against released_date', () => {
    expect(getReleaseDayStatus({ planned_date: '2026-09-25', released_date: '2026-09-25', status: 'Upcoming-Release' }, today))
      .toEqual({ count: 3, text: '2026-09-25 (3)', tone: 'warning', status: 'Upcoming-Release' });
    expect(getReleaseDayStatus({ planned_date: '2026-09-20', released_date: '2026-09-22', status: 'Upcoming-Release' }, today))
      .toEqual({ count: 0, text: '2026-09-22 (0)', tone: 'warning', status: 'Upcoming-Release' });
    expect(getReleaseDayStatus({ planned_date: '2026-09-18', released_date: '2026-09-20', status: 'Upcoming-Release' }, today))
      .toEqual({ count: 2, text: '2026-09-20 (2)', tone: 'red', status: 'Upcoming-Release' });
  });

  it('falls back to planned_date only when an Upcoming release has no released_date', () => {
    expect(getReleaseDayStatus({ planned_date: '2026-09-25', released_date: null, status: 'Upcoming-Release' }, today))
      .toEqual({ count: 3, text: '2026-09-25 (3)', tone: 'warning', status: 'Upcoming-Release' });
    expect(getReleaseDayStatus({ planned_date: '2026-09-20', released_date: '', status: 'Upcoming-Release' }, today))
      .toEqual({ count: 2, text: '2026-09-20 (2)', tone: 'red', status: 'Upcoming-Release' });
  });

  it('uses the date the current status was set, not the first change after Upcoming', () => {
    expect(getReleaseDayStatus({
      released_date: '2026-09-25',
      release_transition_date: '2026-09-23',
      status_changed_date: '2026-09-26',
      status: 'In-Progress'
    }, today)).toEqual({ count: 1, text: '2026-09-26 (1)', tone: 'red', status: 'In-Progress' });
    expect(getReleaseDayStatus({
      released_date: '2026-09-25',
      to_be_tested_date: '2026-09-24',
      status: 'To-be-Tested'
    }, today)).toEqual({ count: 1, text: '2026-09-24 (1)', tone: 'green', status: 'To-be-Tested' });
    expect(getReleaseDayStatus({
      released_date: '2026-09-25',
      closed_date: '2026-09-27',
      status: 'Failed'
    }, today)).toEqual({ count: 2, text: '2026-09-27 (2)', tone: 'red', status: 'Failed' });
  });

  it('uses the latest matching current-status log when no status date field is returned', () => {
    expect(getReleaseDayStatus({
      released_date: '2026-09-25',
      status: 'On-Hold',
      status_logs: [
        { status: 'In-Progress', logdate: '2026-09-21' },
        { status: 'On-Hold', logdate: '2026-09-23' },
        { status: 'On-Hold', logdate: '2026-09-24' }
      ]
    }, today)).toEqual({ count: 1, text: '2026-09-24 (1)', tone: 'green', status: 'On-Hold' });
  });

  it('uses frozen calculations for every non-Upcoming release status', () => {
    ['In-Progress', 'On-Hold', 'To-be-Tested', 'Rejected', 'Pass', 'Failed'].forEach(status => {
      expect(getReleaseDayStatus({
        released_date: '2026-09-25',
        release_transition_date: '2026-09-24',
        status
      }, today)).withContext(status)
        .toEqual({ count: 1, text: '2026-09-24 (1)', tone: 'green', status });
    });
  });

  it('uses status-change or closed dates when status history is unavailable', () => {
    expect(getReleaseDayStatus({ released_date: '2026-09-25', status_changed_date: '2026-09-24', status: 'In-Progress' }, today))
      .toEqual({ count: 1, text: '2026-09-24 (1)', tone: 'green', status: 'In-Progress' });
    expect(getReleaseDayStatus({ released_date: '2026-09-25', closed_date: '2026-09-27', status: 'Pass' }, today))
      .toEqual({ count: 2, text: '2026-09-27 (2)', tone: 'red', status: 'Pass' });
  });

  it('uses planned_date as the deadline for non-Upcoming statuses without released_date', () => {
    expect(getReleaseDayStatus({
      planned_date: '2026-09-25',
      status_changed_date: '2026-09-23',
      status: 'To-be-Tested'
    }, today)).toEqual({ count: 2, text: '2026-09-23 (2)', tone: 'green', status: 'To-be-Tested' });
  });

  it('does not invent a frozen result when all transition dates are missing or invalid', () => {
    expect(getReleaseDayStatus({ released_date: '2026-09-25', status: 'Pass' }, today))
      .toEqual({ count: null, text: '-', tone: 'none', status: 'Pass' });
    expect(getReleaseDayStatus({ released_date: '2026-09-25', status_changed_date: '2026-02-30', status: 'Pass' }, today))
      .toEqual({ count: null, text: '-', tone: 'none', status: 'Pass' });
    expect(getReleaseDayStatus({ released_date: '2026-02-30', release_transition_date: '2026-09-22', status: 'Pass' }, today))
      .toEqual({ count: null, text: '-', tone: 'none', status: 'Pass' });
  });
});
