export type AttendanceReportTone = 'good' | 'bad' | 'target' | 'extra' | 'warning' | 'present' | 'absent' | 'leave' | 'holiday' | 'week-off' | 'proper-thumb' | 'improper-thumb' | 'default';

export function isMissingAttendanceValue(value: any): boolean {
  const label = `${value ?? ''}`.trim().toLowerCase();
  return !label || ['--', '-', 'null', 'undefined'].includes(label);
}

export function attendanceDurationInMinutes(value: any): number {
  const normalized = `${value ?? ''}`.trim();
  if (isMissingAttendanceValue(normalized)) return 0;

  const clock = normalized.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) {
    return Number(clock[1]) * 60 + Number(clock[2]) + (Number(clock[3] || 0) >= 30 ? 1 : 0);
  }

  const dottedClock = normalized.match(/^(\d{1,3})\.(\d{2})$/);
  if (dottedClock && Number(dottedClock[2]) < 60) {
    return Number(dottedClock[1]) * 60 + Number(dottedClock[2]);
  }

  const decimalHours = normalized.match(/^(\d+(?:\.\d+)?)$/);
  if (decimalHours) return Math.round(Number(decimalHours[1]) * 60);

  const hoursAndMinutes = normalized.match(/(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?/i);
  if (!hoursAndMinutes || (!hoursAndMinutes[1] && !hoursAndMinutes[2])) return 0;
  return Math.round(Number(hoursAndMinutes[1] || 0) * 60) + Number(hoursAndMinutes[2] || 0);
}

export function attendanceClockInMinutes(value: any, assumeEvening = false): number | null {
  if (isMissingAttendanceValue(value)) return null;
  const match = `${value}`.trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 23) return null;

  const meridiem = (match[3] || '').toUpperCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === 'PM' ? 12 : 0);
  } else if (assumeEvening && hours > 0 && hours < 12) {
    hours += 12;
  }
  return hours * 60 + minutes;
}

export function attendanceTimeTone(field: 'inTime' | 'outTime', value: any): AttendanceReportTone | null {
  const minutes = attendanceClockInMinutes(value, field === 'outTime');
  if (minutes === null) return null;
  if (field === 'inTime') return minutes < 570 ? 'good' : minutes > 570 ? 'bad' : 'target';
  return minutes < 1110 ? 'bad' : minutes > 1110 ? 'good' : 'target';
}

export function attendanceWorkHoursTone(value: any): AttendanceReportTone | null {
  if (isMissingAttendanceValue(value)) return null;
  const minutes = attendanceDurationInMinutes(value);
  return minutes < 480 ? 'bad' : minutes > 480 ? 'good' : 'target';
}

export function attendanceStatusTone(value: any): AttendanceReportTone {
  const status = `${value ?? ''}`.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  if (status.includes('absent')) return 'absent';
  if (status.includes('improper thumb') || status.includes('improperthumb')) return 'improper-thumb';
  if (status.includes('proper thumb') || status.includes('properthumb')) return 'proper-thumb';
  if (status.includes('late')) return 'warning';
  if (status.includes('present')) return 'present';
  if (status.includes('leave') || status.includes('half day') || status.includes('halfday')) return 'leave';
  if (status.includes('holiday')) return 'holiday';
  if (status.includes('week off') || status.includes('weekoff') || status.includes('weekly off')) return 'week-off';
  return 'default';
}
