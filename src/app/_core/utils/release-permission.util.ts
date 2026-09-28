export interface ReleasePermissionRoles {
  isAdmin?: boolean;
  isManager?: boolean;
}

export interface ReleasePermissionData {
  status?: unknown;
  assigned_from?: unknown;
  assignedFrom?: unknown;
  assigned_from_id?: unknown;
  assignedFromId?: unknown;
  assigned_to?: unknown;
  assignedTo?: unknown;
  assigned_to_id?: unknown;
  assignedToId?: unknown;
}

const ASSIGNED_TO_BLOCKED_STATUSES = new Set([
  'to-be-tested'
]);

export function canModifyRelease(
  release: ReleasePermissionData | null | undefined,
  employeeId: unknown,
  roles: ReleasePermissionRoles | null | undefined
): boolean {
  if (roles?.isAdmin || roles?.isManager) {
    return true;
  }

  const normalizedEmployeeId = normalizeValue(employeeId);
  if (!normalizedEmployeeId || !release) {
    return false;
  }

  const assignedFrom = normalizeValue(
    release.assigned_from
      ?? release.assignedFrom
      ?? release.assigned_from_id
      ?? release.assignedFromId
  );

  if (assignedFrom === normalizedEmployeeId) {
    return true;
  }

  const status = normalizeValue(release.status).toLowerCase();
  if (!status || ASSIGNED_TO_BLOCKED_STATUSES.has(status)) {
    return false;
  }

  const assignedTo = normalizeValue(
    release.assigned_to
      ?? release.assignedTo
      ?? release.assigned_to_id
      ?? release.assignedToId
  );

  return assignedTo === normalizedEmployeeId;
}

function normalizeValue(value: unknown): string {
  return `${value ?? ''}`.trim();
}
