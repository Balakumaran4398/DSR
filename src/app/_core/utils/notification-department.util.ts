export function extractNotificationEmployeeDirectory(response: any): any[] {
  if (Array.isArray(response)) return response;

  const candidates = [
    response?.employees,
    response?.employee_list,
    response?.employeeList,
    response?.users,
    response?.data,
    response?.details,
    response?.result,
    response?.results
  ];
  return candidates.find(Array.isArray) || [];
}

export function getNotificationRecordDepartmentId(record: any, employeeDirectory: any[]): number | null {
  const directDepartmentId = getDepartmentId(record);
  if (directDepartmentId !== null) return directDepartmentId;

  const recordEmployeeIds = getRecordEmployeeIds(record);
  const recordEmployeeName = normalizeName(
    getAssignedEmployeeName(record) ?? record?.employee_name ?? record?.employeeName ?? record?.name
  );
  const employee = employeeDirectory.find(candidate => {
    const candidateIds = getDirectoryEmployeeIds(candidate);
    if (recordEmployeeIds.length && candidateIds.length) {
      return recordEmployeeIds.some(id => candidateIds.includes(id));
    }

    const candidateName = normalizeName(candidate?.employee_name ?? candidate?.employeeName ?? candidate?.name);
    return !!recordEmployeeName && recordEmployeeName === candidateName;
  });

  return employee ? getDepartmentId(employee) : null;
}

export function isNotificationRecordInDepartments(
  record: any,
  employeeDirectory: any[],
  allowedDepartmentIds: number[],
  allowedDepartmentNames: string[]
): boolean {
  const departmentId = getNotificationRecordDepartmentId(record, employeeDirectory);
  if (departmentId !== null && allowedDepartmentIds.includes(departmentId)) return true;

  const departmentName = normalizeDepartmentName(getDepartmentName(record, employeeDirectory));
  const allowedNames = allowedDepartmentNames.map(normalizeDepartmentName);
  return !!departmentName && allowedNames.includes(departmentName);
}

export function filterNotificationRecordsForViewer(
  records: any[],
  role: 'admin' | 'manager' | 'employee' | 'other',
  employeeId: string | number | null,
  viewer: any,
  employeeDirectory: any[],
  allowedDepartmentIds: number[],
  allowedDepartmentNames: string[]
): any[] {
  if (role === 'admin') return records;
  if (role === 'manager') {
    // Managers can see all notification categories, but only within their own
    // department. Do not restrict which departments are eligible by category.
    if (!hasDepartmentIdentity(viewer, employeeDirectory)) return [];
    return records.filter(record => {
      const recordHasDepartment = hasDepartmentIdentity(record, employeeDirectory);
      return !recordHasDepartment || (
        isNotificationRecordInSameDepartment(record, viewer, employeeDirectory)
      );
    });
  }
  if (role !== 'employee' || employeeId === null || employeeId === undefined || employeeId === '') return [];
  if (!isNotificationRecordInDepartments(viewer, employeeDirectory, allowedDepartmentIds, allowedDepartmentNames)) return [];

  return records.filter(record => {
    if (hasDepartmentIdentity(record, employeeDirectory)
      && !isNotificationRecordInDepartments(record, employeeDirectory, allowedDepartmentIds, allowedDepartmentNames)) return false;

    return isNotificationRecordForEmployee(record, employeeId, viewer, employeeDirectory) !== false;
  });
}

export function isNotificationRecordInSameDepartment(record: any, viewer: any, employeeDirectory: any[]): boolean {
  const recordDepartmentId = getNotificationRecordDepartmentId(record, employeeDirectory);
  const viewerDepartmentId = getNotificationRecordDepartmentId(viewer, employeeDirectory);
  if (recordDepartmentId !== null && viewerDepartmentId !== null) {
    return recordDepartmentId === viewerDepartmentId;
  }

  const recordDepartmentName = normalizeDepartmentName(getDepartmentName(record, employeeDirectory));
  const viewerDepartmentName = normalizeDepartmentName(getDepartmentName(viewer, employeeDirectory));
  // Account manager profiles sometimes contain only the department name while
  // not_send_dsr rows contain only department_id. Treat ID 11 and its names as
  // the same department so those rows survive the manager's same-department filter.
  if (recordDepartmentId === 11 && viewerDepartmentName === 'accounts') return true;
  if (viewerDepartmentId === 11 && recordDepartmentName === 'accounts') return true;
  return !!recordDepartmentName && recordDepartmentName === viewerDepartmentName;
}

function getDepartmentId(record: any): number | null {
  const raw = record?.department_id
    ?? record?.departmentID
    ?? record?.departmentId
    ?? record?.departmentid
    ?? (typeof record?.department_name === 'number' || /^\d+$/.test(String(record?.department_name ?? '')) ? record?.department_name : null)
    ?? (typeof record?.departmentName === 'number' || /^\d+$/.test(String(record?.departmentName ?? '')) ? record?.departmentName : null)
    ?? (typeof record?.dept_name === 'number' || /^\d+$/.test(String(record?.dept_name ?? '')) ? record?.dept_name : null)
    ?? (typeof record?.deptName === 'number' || /^\d+$/.test(String(record?.deptName ?? '')) ? record?.deptName : null)
    ?? record?.dept_id
    ?? record?.deptId
    ?? record?.deptid
    ?? (typeof record?.department === 'number' || /^\d+$/.test(String(record?.department ?? '')) ? record?.department : null)
    ?? record?.department?.id
    ?? record?.department?.department_id
    ?? record?.department?.departmentId
    ?? record?.department?.dept_id
    ?? record?.dept?.id
    ?? record?.dept?.department_id
    ?? record?.dept?.departmentId
    ?? record?.dept?.dept_id;
  const id = Number(raw);
  return raw !== null && raw !== undefined && raw !== '' && Number.isFinite(id) ? id : null;
}

function getDepartmentName(record: any, employeeDirectory: any[]): string {
  const directName = record?.department_name
    ?? record?.departmentName
    ?? record?.dept_name
    ?? record?.deptName
    ?? (typeof record?.department === 'string' ? record.department : null)
    ?? (typeof record?.dept === 'string' ? record.dept : null)
    ?? record?.department?.department_name
    ?? record?.department?.departmentName
    ?? record?.department?.name
    ?? record?.dept?.department_name
    ?? record?.dept?.departmentName
    ?? record?.dept?.name;
  if (directName) return String(directName);

  const recordEmployeeIds = getRecordEmployeeIds(record);
  const recordEmployeeName = normalizeName(
    getAssignedEmployeeName(record) ?? record?.employee_name ?? record?.employeeName ?? record?.name
  );
  const employee = employeeDirectory.find(candidate => {
    const candidateIds = getDirectoryEmployeeIds(candidate);
    if (recordEmployeeIds.length && candidateIds.length) {
      return recordEmployeeIds.some(id => candidateIds.includes(id));
    }

    const candidateName = normalizeName(candidate?.employee_name ?? candidate?.employeeName ?? candidate?.name);
    return !!recordEmployeeName && recordEmployeeName === candidateName;
  });

  return employee
    ? String(employee?.department_name
      ?? employee?.departmentName
      ?? employee?.dept_name
      ?? employee?.deptName
      ?? (typeof employee?.department === 'string' ? employee.department : null)
      ?? (typeof employee?.dept === 'string' ? employee.dept : null)
      ?? employee?.department?.department_name
      ?? employee?.department?.departmentName
      ?? employee?.department?.name
      ?? employee?.dept?.department_name
      ?? employee?.dept?.departmentName
      ?? employee?.dept?.name
      ?? '')
    : '';
}

function hasDepartmentIdentity(record: any, employeeDirectory: any[]): boolean {
  return getNotificationRecordDepartmentId(record, employeeDirectory) !== null
    || !!normalizeName(getDepartmentName(record, employeeDirectory));
}

function isNotificationRecordForEmployee(
  record: any,
  employeeId: string | number,
  viewer: any,
  employeeDirectory: any[]
): boolean | null {
  const targetIds = new Set([String(employeeId).trim()]);
  getRecordEmployeeIds(viewer).forEach(id => targetIds.add(id));
  const viewerIdCandidates = new Set(targetIds);
  const directoryViewer = employeeDirectory.find(candidate =>
    getDirectoryEmployeeIds(candidate).some(id => viewerIdCandidates.has(id))
  );
  getDirectoryEmployeeIds(directoryViewer).forEach(id => targetIds.add(id));

  const recordIds = getAssignedEmployeeIds(record);
  const employeeIds = recordIds.length ? recordIds : getRecordEmployeeIds(record);
  if (employeeIds.length) {
    return employeeIds.some(id => targetIds.has(id));
  }

  const viewerName = normalizeName(findEmployeeName(employeeDirectory, targetIds)
    ?? viewer?.employee_name ?? viewer?.employeeName ?? viewer?.name ?? viewer?.username);
  const recordName = normalizeName(
    getAssignedEmployeeName(record)
      ?? record?.employee_name
      ?? record?.employeeName
      ?? record?.emp_name
      ?? record?.empName
      ?? record?.name
  );
  if (recordName && viewerName) return recordName === viewerName;
  return null;
}

function getAssignedEmployeeIds(record: any): string[] {
  return normalizeIdValues([
    record?.assigned_to_employee_id,
    record?.assigned_employee_id,
    record?.assignedEmployeeId,
    record?.assigned_to_id,
    record?.assignedToId,
    record?.assigned_to,
    record?.assignedTo,
    record?.empId,
    record?.emp_id
  ]);
}

function getRecordEmployeeIds(record: any): string[] {
  return normalizeIdValues([
    record?.assigned_to_employee_id,
    record?.assigned_employee_id,
    record?.assignedEmployeeId,
    record?.assigned_to_id,
    record?.assignedToId,
    record?.assigned_to,
    record?.assignedTo,
    record?.employee_id,
    record?.employeeId,
    record?.employeeid,
    record?.emp_id,
    record?.empId,
    record?.empid,
    record?.selected_employee_id,
    record?.selectedEmployeeId,
    record?.selected_emp_id,
    record?.user_employee_id,
    record?.user_id,
    record?.userId
  ]);
}

function getDirectoryEmployeeIds(record: any): string[] {
  return normalizeIdValues([
    record?.employee_id,
    record?.employeeId,
    record?.employeeid,
    record?.emp_id,
    record?.empId,
    record?.empid,
    record?.id,
    record?.user_id,
    record?.userId,
    record?.filter_id
  ]);
}

function normalizeIdValues(values: any[]): string[] {
  const ids = values.flatMap(value => {
    if (value === null || value === undefined || value === '') return [];
    if (typeof value === 'object') {
      return [
        value.employee_id, value.employeeId, value.employeeid, value.emp_id, value.empId,
        value.empid, value.user_id, value.userId, value.id
      ].filter(id => id !== null && id !== undefined && id !== '').map(id => String(id).trim());
    }
    const id = String(value).trim();
    return /^\d+$/.test(id) ? [id] : [];
  });
  return [...new Set(ids)];
}

function getAssignedEmployeeName(record: any): string | null {
  const assignedTo = record?.assigned_to ?? record?.assignedTo;
  if (typeof assignedTo === 'string' && !/^\d+$/.test(assignedTo.trim())) return assignedTo;
  return record?.assigned_to_name ?? record?.assignedToName ?? null;
}

function findEmployeeName(employeeDirectory: any[], targetIds: Set<string>): string | null {
  const employee = employeeDirectory.find(candidate =>
    getDirectoryEmployeeIds(candidate).some(id => targetIds.has(id))
  );
  if (!employee) return null;
  return String(employee?.employee_name
    ?? employee?.employeeName
    ?? employee?.emp_name
    ?? employee?.empName
    ?? employee?.name
    ?? `${employee?.firstname ?? ''} ${employee?.lastname ?? ''}`.trim()
    ?? '') || null;
}

function normalizeDepartmentName(value: any): string {
  const normalized = normalizeName(value).replace(/^(department|dept)/, '').replace(/(department|dept)$/, '');
  return normalized === 'account' ? 'accounts' : normalized;
}

function normalizeName(value: any): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
