import { filterNotificationRecordsForViewer } from './notification-department.util';

describe('notification department visibility', () => {
  const employeeDirectory = [
    { employee_id: 11, department_id: 4, department_name: 'Hardware' },
    { employee_id: 12, department_id: 4, department_name: 'Hardware' },
    { employee_id: 20, department_id: 6, department_name: 'Headend' }
  ];

  it('shows a manager records only from their own department', () => {
    const records = [
      { employee_id: 11, department_name: 'Hardware' },
      { employee_id: 20, department_name: 'Headend' },
      { employee_name: 'Backend-scoped row without department metadata' }
    ];

    expect(filterNotificationRecordsForViewer(
      records,
      'manager',
      100,
      { employee_id: 100, department_name: 'Hardware Department' },
      employeeDirectory,
      [4, 6],
      ['Hardware', 'Headend']
    )).toEqual([records[0], records[2]]);
  });

  it('allows managers from any department and still excludes records from other departments', () => {
    const records = [
      { employee_id: 30, department_id: 8 },
      { employee_id: 20, department_id: 6 },
      { employee_name: 'Backend-scoped row without department metadata' }
    ];

    expect(filterNotificationRecordsForViewer(
      records,
      'manager',
      300,
      { employee_id: 300, department_id: 8 },
      [],
      [1, 2, 3],
      ['Ridapps']
    )).toEqual([records[0], records[2]]);
  });

  it('shows an employee only their own record in an allowed department', () => {
    const records = [
      { assigned_to: 11, department_id: 4 },
      { assigned_to: 12, department_id: 4 },
      { assigned_to: 11, department_id: 6 },
      { ticket_title: 'Backend-scoped row without employee metadata' }
    ];

    expect(filterNotificationRecordsForViewer(
      records,
      'employee',
      11,
      { empid: 11, department_id: 4 },
      employeeDirectory,
      [4],
      ['Hardware']
    )).toEqual([records[0], records[3]]);
  });

  it('matches Account and Accounts department names', () => {
    const records = [
      { employee_id: 101, department_name: 'Accounts' },
      { employee_id: 202, department_name: 'Hardware' }
    ];

    expect(filterNotificationRecordsForViewer(
      records,
      'manager',
      99,
      { employee_id: 99, department_name: 'Account' },
      [],
      [11],
      ['Accounts']
    )).toEqual([records[0]]);
  });

});
