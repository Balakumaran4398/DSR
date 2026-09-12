import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';


import { Router } from '@angular/router';
import { StorageService } from './storage.service';
import { URL } from 'src/app/api.base';
import { BehaviorSubject, catchError, concat, defer, EMPTY, Observable, of, Subscription, throwError } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { NotificationDateRange, NotificationDateRangeService } from './notification-date-range.service';

const AUTH_URL = URL.AUTH_URL();
const BASE_URL = URL.BASE_URL();
const LOADER_SHOW_HEADER = 'X-Show-Loader';
@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private readonly apiCachePrefix = 'dsr-api-cache:v1:';

  constructor(
    private http: HttpClient,
    private storageService: StorageService,
    private router: Router,
    private notificationDateRangeService: NotificationDateRangeService
  ) { }

  private readonly notificationDataSubject = new BehaviorSubject<any | null>(null);
  readonly notificationData$ = this.notificationDataSubject.asObservable();
  private readonly notificationLoadingSubject = new BehaviorSubject<boolean>(false);
  readonly notificationLoading$ = this.notificationLoadingSubject.asObservable();
  private notificationRequest?: Subscription;
  private notificationRequestKey: string | null = null;
  private notificationLoadedKey: string | null = null;
  private notificationRequestVersion = 0;
  private notificationLoadingRequests = 0;

  // -----------------------------
  // LOGIN
  // -----------------------------
  signin(payload: { username: string; password: string }) {
    return this.http.post(`${AUTH_URL}/signin`, payload, {
      // headers: new HttpHeaders({ [LOADER_SHOW_HEADER]: 'true' })
    });
  }

  // -----------------------------
  // LOGOUT (NO API CALL)
  // -----------------------------
  logout(): void {
    this.resetNotificationCount();
    this.clearPersistentApiCache();
    this.storageService.logout();
    this.router.navigate(['/login']);
  }

  loadNotificationCount(range: NotificationDateRange = this.notificationDateRangeService.currentRange): void {
    this.requestNotificationCount(range, false);
  }

  refreshNotificationCount(range: NotificationDateRange = this.notificationDateRangeService.currentRange): void {
    this.requestNotificationCount(range, true);
  }

  resetNotificationCount(): void {
    this.notificationRequestVersion++;
    this.notificationRequest?.unsubscribe();
    this.notificationRequest = undefined;
    this.notificationRequestKey = null;
    this.notificationLoadedKey = null;
    this.notificationDataSubject.next(null);
    this.notificationLoadingRequests = 0;
    this.notificationLoadingSubject.next(false);
    this.notificationDateRangeService.resetToCurrentMonth();
  }

  private requestNotificationCount(range: NotificationDateRange, force: boolean): void {
    const empId = this.storageService.getEmpId();
    const requestKey = `${empId ?? ''}|${range.startDate}|${range.endDate}`;

    if (!force && (requestKey === this.notificationLoadedKey || requestKey === this.notificationRequestKey)) {
      return;
    }

    if (this.notificationRequest) {
      this.notificationRequest.unsubscribe();
      this.notificationRequest = undefined;
      this.endNotificationLoading();
    }
    const requestVersion = ++this.notificationRequestVersion;
    this.notificationRequestKey = requestKey;
    this.beginNotificationLoading();

    this.notificationRequest = this.getNotificationCountRequest(empId, range.startDate, range.endDate, true, () => {
      // Mark the key only after the background request has returned successfully.
      if (requestVersion === this.notificationRequestVersion) {
        this.notificationLoadedKey = requestKey;
      }
    }).subscribe({
      next: (response: any) => {
        if (requestVersion !== this.notificationRequestVersion) return;

        this.notificationDataSubject.next(response);
      },
      error: (error: any) => {
        if (requestVersion !== this.notificationRequestVersion) return;

        this.endNotificationLoading();
        this.notificationRequest = undefined;
        this.notificationRequestKey = null;
        console.error('getNotificationCount error', error);
      },
      complete: () => {
        if (requestVersion !== this.notificationRequestVersion) return;

        this.endNotificationLoading();
        this.notificationRequest = undefined;
        this.notificationRequestKey = null;
      }
    });
  }

  private beginNotificationLoading(): void {
    this.notificationLoadingRequests++;
    this.notificationLoadingSubject.next(true);
  }

  private endNotificationLoading(): void {
    this.notificationLoadingRequests = Math.max(0, this.notificationLoadingRequests - 1);
    this.notificationLoadingSubject.next(this.notificationLoadingRequests > 0);
  }

  private getCachedAndRefresh<T>(
    cacheKey: string,
    requestFactory: (hasCachedResponse: boolean) => Observable<T>,
    onFreshResponse?: (response: T) => void
  ): Observable<T> {
    const cached = this.readPersistentCache<T>(cacheKey);
    const cachedResponse$ = cached.found ? of(cached.value as T) : EMPTY;
    const freshResponse$ = requestFactory(cached.found).pipe(
      tap(response => {
        this.writePersistentCache(cacheKey, response);
        onFreshResponse?.(response);
      }),
      catchError(error => cached.found ? EMPTY : throwError(() => error))
    );

    return concat(cachedResponse$, freshResponse$);
  }

  private createCacheKey(name: string, params: unknown[]): string {
    return `${this.apiCachePrefix}${name}:${encodeURIComponent(JSON.stringify(params))}`;
  }

  private readPersistentCache<T>(cacheKey: string): { found: boolean; value?: T } {
    try {
      if (typeof localStorage === 'undefined') {
        return { found: false };
      }

      const raw = localStorage.getItem(cacheKey);
      if (!raw) {
        return { found: false };
      }

      const parsed = JSON.parse(raw);
      if (!parsed || !Object.prototype.hasOwnProperty.call(parsed, 'value')) {
        return { found: false };
      }

      return { found: true, value: parsed.value as T };
    } catch {
      return { found: false };
    }
  }

  private writePersistentCache<T>(cacheKey: string, value: T): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(cacheKey, JSON.stringify({ value }));
      }
    } catch {
      // Caching is an enhancement; an unavailable or full storage must not break the API response.
    }
  }

  private clearPersistentApiCache(): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      const cacheKeys: string[] = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(this.apiCachePrefix)) {
          cacheKeys.push(key);
        }
      }

      cacheKeys.forEach(key => localStorage.removeItem(key));
    } catch {
      // Ignore storage cleanup failures during logout.
    }
  }

  getAllShifts() {
    return this.http.get(`${BASE_URL}/common/getallshifts`);
  }
  getAllDepartments(): Observable<any> {
    const cacheKey = this.createCacheKey('all-departments', []);
    const url = `${BASE_URL}/department/getalldepartments`;

    return this.getCachedAndRefresh(cacheKey, hasCachedResponse => {
      const options = hasCachedResponse
        ? { headers: new HttpHeaders({ 'X-Skip-Loader': 'true' }) }
        : {};

      return this.http.get<any[]>(url, options);
    });
  }
  getDesignationByDepartment(department_id: any) {
    return this.http.get(`${BASE_URL}/department/designationbydepartment?department_id=${department_id}`);
  }
  createUser(payload: any) {
    return this.http.post(`${BASE_URL}/user/create`, payload);
  }
  getUsersAll(employee_id: any) {
    return this.http.get(`${BASE_URL}/user/all?employee_id=${employee_id}`);
  }
  getemployeedetails(username: any) {
    return this.http.get(`${BASE_URL}/user/getemployeedetails?username=${username}`);
  }
  updateskills(payload: any) {
    return this.http.post(`${BASE_URL}/user/updateskills`, payload);
  }
  deleteSkill(payload: any) {
    return this.http.request('delete', `${BASE_URL}/user/deleteskills`, {
      body: payload
    });
  }

  getprojectmembersById(project_id: any) {
    return this.http.get(`${BASE_URL}/user/getprojectmembers?project_id=${project_id}`);
  }
  getEmployeelistByProjectId(project_id: any) {
    return this.http.get(`${BASE_URL}/user/getemployeelistbyproject?project_id=${project_id}`);
  }

  relieveuser(payload: any) {
    return this.http.post(`${BASE_URL}/user/releaveEmployee?employeeid=${payload.employeeid}&username=${payload.username}&reason=${payload.reason}&releave_date=${payload.releave_date}`, {});
  }

  updateUser(payload: any) {
    return this.http.post(`${BASE_URL}/user/update`, payload);
  }

  deleteUser(employee_id: any, username: any) {
    return this.http.delete(`${BASE_URL}/user/delete?employee_id=${employee_id}&username=${username}`);
  }

  getManagerList() {
    return this.http.get(`${BASE_URL}/user/getmanagerlist`);
  }

  getEmployeeList(): Observable<any[]> {
    const cacheKey = this.createCacheKey('employee-list', []);
    const url = `${BASE_URL}/user/getemployeelist`;

    return this.getCachedAndRefresh(cacheKey, hasCachedResponse => {
      const options = hasCachedResponse
        ? { headers: new HttpHeaders({ 'X-Skip-Loader': 'true' }) }
        : {};

      return this.http.get<any[]>(url, options);
    });
  }

  getAllProjectsByEmployeeId(employee_id: any) {
    return this.http.get(`${BASE_URL}/project/all?employee_id=${employee_id}`);
  }

  createProject(payload: any) {
    return this.http.post(`${BASE_URL}/project/create`, payload);
  }

  updateProject(payload: any) {
    return this.http.post(`${BASE_URL}/project/update`, payload);
  }

  deleteProject(username: string, project_id: number) {
    return this.http.delete(`${BASE_URL}/project/delete/?username=${username}&project_id=${project_id}`);
  }

  getAppsTypes() {
    return this.http.get(`${BASE_URL}/common/getapptypes`);
  }
  createTask(payload: any) {
    return this.http.post(`${BASE_URL}/task/create`, payload);
  }
  getAllTasks() {
    return this.http.get(`${BASE_URL}/task/all`);
  }
  getIsasueByProjectIdNdEmployeeId(project_id: any, employee_id: any, phaseid: any, type: any, version: any) {
    return this.http.get(`${BASE_URL}/task/issueList?project_id=${project_id}&employee_id=${employee_id}&phase_id=${phaseid}&task_type=${type}&version=${version}`);
  }
  getTasksByProjectIdNdEmployeeId(project_id: any, employee_id: any, phaseid: any, type: any, fromdate: any, todate: any) {
    return this.http.get(`${BASE_URL}/task/tasklist?project_id=${project_id}&employee_id=${employee_id}&phase_id=${phaseid}&task_type=${type}&fromdate=${fromdate}&todate=${todate}`);
  }
  getTaskOverviewByEmp(payload: any) {
    return this.http.get(`${BASE_URL}/task/taskoverview?employee_id=${payload.employee_id}&selected_emp_id=${payload.selected_emp_id}&fromdate=${payload.fromdate}&todate=${payload.todate}`)
  }

  getAttendanceByEmp(payload: any) {
    return this.http.get(`${BASE_URL}/common/attendancedetails?fromdate=${payload.fromdate}&todate=${payload.todate}&id=${payload.id}`)
  }

  getReleaseOverviewByEmp(payload: any) {
    const departmentId = payload?.department_id ?? payload?.departmentId ?? payload?.dept_id ?? payload?.deptId ?? '';
    const departmentQuery = `${departmentId}`.trim()
      ? `&department_id=${encodeURIComponent(departmentId)}`
      : '';
    const managerName = payload?.manager_name ?? payload?.managerName ?? payload?.manager ?? '';
    const managerQuery = `${managerName}`.trim()
      ? `&manager_name=${encodeURIComponent(managerName)}`
      : '';
    const selectedEmployeeId = payload?.selected_emp_id ?? payload?.selectedEmpId ?? payload?.selected_employee_id ?? payload?.selectedEmployeeId ?? 0;
    const selectedEmployeeQuery = `&selected_emp_id=${encodeURIComponent(`${selectedEmployeeId || 0}`)}`;

    return this.http.get(`${BASE_URL}/release/releaseoverview?employee_id=${payload.employee_id}${selectedEmployeeQuery}&projectid=${payload.projectid}&fromdate=${payload.fromdate}&todate=${payload.todate}${departmentQuery}${managerQuery}`)
  }
  getReleaseOverviewListByEmp(payload: any) {
    const departmentId = payload?.department_id ?? payload?.departmentId ?? payload?.dept_id ?? payload?.deptId ?? '';
    const serializedDepartmentId = Array.isArray(departmentId)
      ? departmentId.join(',')
      : `${departmentId}`;
    const departmentQuery = serializedDepartmentId.trim()
      ? `&department_id=${encodeURIComponent(serializedDepartmentId).replace(/%2C/gi, ',')}`
      : '';
    const managerName = payload?.manager_name ?? payload?.managerName ?? payload?.manager ?? '';
    const managerQuery = `${managerName}`.trim()
      ? `&manager_name=${encodeURIComponent(managerName)}`
      : '';
    const selectedEmployeeId = payload?.selected_emp_id ?? payload?.selectedEmpId ?? payload?.selected_employee_id ?? payload?.selectedEmployeeId ?? 0;
    const selectedEmployeeQuery = `&selected_emp_id=${encodeURIComponent(`${selectedEmployeeId || 0}`)}`;

    return this.http.get(`${BASE_URL}/release/releaseoverviewList?employee_id=${payload.employee_id}${selectedEmployeeQuery}&projectid=${payload.projectid}&fromdate=${payload.fromdate}&todate=${payload.todate}${departmentQuery}${managerQuery}`)
  }

  getNotsendTasks(payload: any) {
    return this.http.get(
      `${BASE_URL}/common/getnotsenddsr?employee_id=${payload.employee_id}&selected_employee_id=${payload.selected_employee_id}&fromdate=${payload.fromdate}&todate=${payload.todate}`
    )
  }

  getBestEmployee(payload: { employee_id: any; department_id: any; fromdate: string; todate: string; top?: number }): Observable<any> {
    const params = new HttpParams()
      .set('employee_id', `${payload.employee_id ?? ''}`)
      .set('department_id', `${payload.department_id ?? ''}`)
      .set('fromdate', payload.fromdate)
      .set('todate', payload.todate)
      .set('top', `${payload.top ?? 3}`);

    return this.http.get(`${BASE_URL}/common/getbestemployee`, {
      params,
      headers: new HttpHeaders({ 'X-Skip-Loader': 'true' })
    });
  }

  deleteTask(username: string, task_id: number) {
    return this.http.delete(`${BASE_URL}/task/delete?username=${username}&task_id=${task_id}`);
  }
  getTasksByEmpIdNdProjectIdNdaDate(project_id: any, employee_id: any, from_date: any = "", to_date: any = "") {
    return this.http.get(`${BASE_URL}/task/tasklistfortracking?project_id=${project_id}&employee_id=${employee_id}`);
  }
  updateTask(payload: any) {
    return this.http.post(`${BASE_URL}/task/update`, payload);
  }
  swapTask(phase_id: any, task_list: any, username: any) {
    return this.http.get(`${BASE_URL}/task/swaptask?phase_id=${phase_id}&task_list=${task_list}&username=${username}`);
  }

  getStatusList(): Observable<any> {
    const cacheKey = this.createCacheKey('status-list', []);
    const url = `${BASE_URL}/common/getstatuslist`;

    return this.getCachedAndRefresh(cacheKey, hasCachedResponse => {
      const options = hasCachedResponse
        ? { headers: new HttpHeaders({ 'X-Skip-Loader': 'true' }) }
        : {};

      return this.http.get(url, options);
    });
  }

  getModelMaster(): Observable<any> {
    return this.http.get(`${BASE_URL}/common/getmodelmaster`);
  }

  getModelCodeList(modelMasterId: any): Observable<any> {
    const params = new HttpParams().set('model_master_id', `${modelMasterId}`);

    return this.http.get(`${BASE_URL}/common/modelcodelist`, { params });
  }

  getSubtasks(taskid: any) {
    return this.http.get(`${BASE_URL}/subtask/getsubtasks?taskid=${taskid}`);
  }

  createSubtask(payload: any) {
    return this.http.post(`${BASE_URL}/subtask/create`, payload);
  }

  updateSubtask(payload: any) {
    return this.http.post(`${BASE_URL}/subtask/update`, payload);
  }

  deleteSubtask(username: string, task_id: number) {
    return this.http.delete(`${BASE_URL}/subtask/delete?username=${username}&sub_task_id=${task_id}`);
  }
  getDsrOverviewByEmpIdNdFromToDateNdUserId(employee_id: number | 0, from_date: any | null, to_date: any | null, user_id: number) {
    return this.http.get(`${BASE_URL}/subtask/dsroverview?employee_id=${employee_id}&from_date=${from_date}&to_date=${to_date}&user_id=${user_id}`);
  }

  createDailyStatus(payload: any) {
    return this.http.post(`${BASE_URL}/subtask/createdailystatus`, payload);
  }

  createdailyDSR(payload: any) {
    return this.http.post(`${BASE_URL}/subtask/createdailyDSR`, payload);
  }

  getDsrDetailsBySubtaskId(subtaskid: any) {
    return this.http.get(`${BASE_URL}/subtask/getdsrdetails?sub_task_id=${subtaskid}`);
  }

  deleteDsr(username: string, dsr_id: number) {
    return this.http.delete(`${BASE_URL}/subtask/deletedsr?username=${username}&dsr_id=${dsr_id}`);
  }
  createtaskdsr(payload: any) {
    return this.http.post(`${BASE_URL}/subtask/createDailyStatus`, payload);
  }
  updatedsr(payload: any) {
    return this.http.post(`${BASE_URL}/subtask/updatedsr`, payload);
  }

  getdsrdetailsbytask(taskid: any) {
    return this.http.get(`${BASE_URL}/task/getdsrdetailsbytask?taskid=${taskid}`);
  }

  getPhaseByProjectId(project_id: number) {
    return this.http.get(`${BASE_URL}/phase/getphasebyproject?project_id=${project_id}`);
  }

  createPhase(payload: any) {
    return this.http.post(`${BASE_URL}/phase/create`, payload);
  }

  updatePhase(payload: any) {
    return this.http.post(`${BASE_URL}/phase/update`, payload);
  }

  createRelease(payload: any) {
    return this.http.post(`${BASE_URL}/release/create`, payload);
  }

  updateRelease(payload: any) {
    return this.http.post(`${BASE_URL}/release/update`, payload);
  }
  getReleaseByProjectId(project_id: number) {
    return this.http.get(`${BASE_URL}/release/getreleasebyproject?project_id=${project_id}`);
  }
  getReleaseMailById(id: any) {
    return this.http.get(`${BASE_URL}/release/releasemailbyid?id=${id}`);
  }
  deleteRelease(id: number, createdby: string) {
    return this.http.delete(`${BASE_URL}/release/deleterelease?id=${id}&createdby=${createdby}`);
  }

  getVersionsById(project_id: number): Observable<string[]> {
    return this.http.get<string[]>(`${BASE_URL}/release/versionsbyproject`, { params: { projectid: project_id } });
  }
  // Dashboard ==========
  // getDashboardDetailsByEmployeeId(employee_id: any, project_id: any) {
  //   return this.http.get(`${BASE_URL}/common/dashboarddetails?employee_id=${employee_id}&project_id=${project_id}`);
  // }
  getDashboardDetailsByEmployeeId(employee_id: any, project_id: any, fromDate: any = '', toDate: any = ''): Observable<any> {
    const cacheKey = this.createCacheKey('dashboarddetails', [employee_id, project_id, fromDate, toDate]);
    const url = `${BASE_URL}/common/dashboarddetails?employee_id=${employee_id}&project_id=${project_id}&fromDate=${fromDate}&toDate=${toDate}`;

    return this.getCachedAndRefresh(cacheKey, hasCachedResponse => {
      const options = hasCachedResponse
        ? { headers: new HttpHeaders({ 'X-Skip-Loader': 'true' }) }
        : {};

      return this.http.get(url, options);
    });
  }

  getDashboardDetailsByEmployeeIdDeptwise(
    employee_id: any,
    project_id: any,
    fromDate: any,
    toDate: any,
    departmentId: any
  ): Observable<any> {
    const cacheKey = this.createCacheKey('dashboarddetails-deptwise', [
      employee_id,
      project_id,
      fromDate,
      toDate,
      departmentId
    ]);
    const serializedDepartmentId = Array.isArray(departmentId) ? departmentId.join(',') : `${departmentId ?? ''}`;
    const encodedDepartmentId = encodeURIComponent(serializedDepartmentId).replace(/%2C/gi, ',');
    const url = `${BASE_URL}/common/dashboarddetails_deptwise?employee_id=${employee_id}&project_id=${project_id}&fromDate=${fromDate}&toDate=${toDate}&department_id=${encodedDepartmentId}`;

    return this.getCachedAndRefresh(cacheKey, hasCachedResponse => {
      const options = hasCachedResponse
        ? { headers: new HttpHeaders({ 'X-Skip-Loader': 'true' }) }
        : {};

      return this.http.get(url, options);
    });
  }
  getActivityLogs(type: any, id: any, tag: any) {
    return this.http.get(`${BASE_URL}/common/gettasklog?type=${type}&id=${id}&tag=${tag}`);
  }


  createComments(payload: any) {
    return this.http.post(`${BASE_URL}/common/createcomments`, payload);
  }
  updatecomments(payload: any) {
    return this.http.post(`${BASE_URL}/common/updatecomments`, payload);
  }
  getComments(type: any, id: any,) {
    return this.http.get(`${BASE_URL}/common/getcommentsbyid?type=${type}&id=${id}`);
  }
  deleteComment(username: string, id: number) {
    return this.http.delete(`${BASE_URL}/common/deletecomment?username=${username}&id=${id}`);
  }

  getDocumentListByProjectId(id: any,) {
    return this.http.get(`${BASE_URL}/document/documentList?id=${id}`);
  }
  uploadDocument(payload: any) {
    return this.http.post(`${BASE_URL}/document/upload`, payload);
  }
  LoadAttendance(formData: any) {
    return this.http.post(`${BASE_URL}/common/loadattendance`, formData);
  }

  // Hierarchy
  getHierarchydetails(employee_id: any,) {
    return this.http.get(`${BASE_URL}/common/hierarchydetails?employee_id=${employee_id}`);
  }

  // MOM

  createmom_1(payload: any) {
    return this.http.post(`${BASE_URL}/common/createmom`, payload);

  }

  getmomdetails(employee_id: any,) {
    return this.http.get(`${BASE_URL}/common/getmomdetails?employee_id=${employee_id}`);
  }
  deletemom(id: number, username: string) {
    return this.http.delete(`${BASE_URL}/common/deletemom?id=${id}&username=${username}`);
  }

  getCateory(): Observable<any[]> {
    return this.http.get<any[]>(`${BASE_URL}/common/gettaskcategory`);
  }

  getDocumentList(): Observable<any[]> {
    return this.http.get<any[]>(`${BASE_URL}/admindocument/adminDocumentList`);
  }

  downloadDocument(id: number): Observable<Blob> {
    return this.http.get(`${BASE_URL}/admindocument/download/${id}`, { responseType: 'blob' });
  }

  upload(formdata: any) {
    return this.http.post(`${BASE_URL}/admindocument/upload`, formdata);
  }

  editDoc(id: number, formData: any) {
    console.log('edit api', formData);
    return this.http.put(`${BASE_URL}/admindocument/update/${id}`, formData);
  }

  delDoc(id: number) {
    return this.http.delete(`${BASE_URL}/admindocument/delete?id=${id}`);
  }



  getAllMails(empId: number, userId: number, fromdate: any, todate: any): Observable<any[]> {
    return this.http.get<any[]>(`${BASE_URL}/release/getAllMails?empid=${empId}&user_id=${userId}&fromdate=${fromdate}&todate=${todate}`);
  }

  // getAllMails(empId: number, userId: number): Observable<any[]> {
  //   return this.http.get<any[]>(`${BASE_URL}/release/getAllMails?empid=${empId}&user_id=${userId}`);
  // }

  createClient(payload: any): Observable<any> {
    return this.http.post(`${BASE_URL}/client/createClient`, payload);
  }

  updateClient(payload: any) {
    return this.http.put(`${BASE_URL}/client/updateClient`, payload);
  }

  getAllClients(): Observable<any[]> {
    const cacheKey = this.createCacheKey('all-clients', []);
    const url = `${BASE_URL}/client/allClient`;

    return this.getCachedAndRefresh(cacheKey, hasCachedResponse => {
      const options = hasCachedResponse
        ? { headers: new HttpHeaders({ 'X-Skip-Loader': 'true' }) }
        : {};

      return this.http.get<any[]>(url, options);
    });
  }

  deleteClient(id: number) {
    return this.http.delete(`${BASE_URL}/client/deleteClient/${id}`);
  }

  getAllTickets(empId: number, userId: number, fromDate: string, toDate: string): Observable<any[]> {
    const cacheKey = this.createCacheKey('all-tickets', [empId, userId, fromDate, toDate]);
    const url = `${BASE_URL}/ticket/allTickets?empid=${empId}&userId=${userId}&fromDate=${fromDate}&toDate=${toDate}`;

    return this.getCachedAndRefresh(cacheKey, hasCachedResponse => {
      const options = hasCachedResponse
        ? { headers: new HttpHeaders({ 'X-Skip-Loader': 'true' }) }
        : {};

      return this.http.get<any[]>(url, options);
    });
  }

  getTicketReportByDept(deptId: any, fromDate: string, toDate: string): Observable<any> {
    return this.http.get<any>(`${BASE_URL}/ticket/ticketReportByDept?deptId=${deptId}&fromDate=${fromDate}&toDate=${toDate}`);
  }

  createTicket(payload: any): Observable<any> {
    return this.http.post(`${BASE_URL}/ticket/createTicket/self`, payload);
  }

  updateTicket(payload: any) {
    return this.http.put(`${BASE_URL}/ticket/updateTicket`, payload);
  }

  deleteTicket(id: number) {
    return this.http.delete(`${BASE_URL}/ticket/deleteTicket/${id}`);
  }

  createTicketRise(payload: any): Observable<any> {
    return this.http.post(`${BASE_URL}/ticket/createTicket`, payload);
  }

  getEmployeeListByDepartment(id: number) {
    return this.http.get<any[]>(`${BASE_URL}/ticket/getEmployeeListByDepartment/${id}`);
  }
  // -------Products ----------------
  //Products
  getAllProducts() {
    const cacheKey = this.createCacheKey('all-products', []);
    const url = `${BASE_URL}/product/all`;

    return this.getCachedAndRefresh(cacheKey, hasCachedResponse => {
      const options = hasCachedResponse
        ? { headers: new HttpHeaders({ 'X-Skip-Loader': 'true' }) }
        : {};

      return this.http.get<any[]>(url, options);
    });
  }

  createProduct(payload: any) {
    return this.http.post(`${BASE_URL}/product/create`, payload);
  }

  deleteProduct(id: number) {
    return this.http.delete(`${BASE_URL}/product/delete/${id}`);
  }

  updateProduct(payload: any) {
    return this.http.post(`${BASE_URL}/product/update`, payload);
  }

  getNotificationCount(empId: string | null, fromDate: string, toDate: string, skipLoader = false) {
    return defer(() => {
      this.beginNotificationLoading();
      return this.getNotificationCountRequest(empId, fromDate, toDate, skipLoader).pipe(
        finalize(() => this.endNotificationLoading())
      );
    });
  }

  getGoogleSheetLinksByEmployeeId(employeeId: string | number): Observable<any> {
    const params = new HttpParams().set('employeeid', `${employeeId}`);
    return this.http.get(`${BASE_URL}/common/googlesheetlinkid`, { params });
  }

  getAllGoogleSheetLinks(): Observable<any> {
    return this.http.get(`${BASE_URL}/common/googlesheetlinksall`);
  }

  private getNotificationCountRequest(
    empId: string | null,
    fromDate: string,
    toDate: string,
    skipLoader = false,
    onFreshResponse?: () => void
  ) {
    const cacheKey = this.createCacheKey('notification-count', [empId, fromDate, toDate]);
    const url = `${BASE_URL}/common/getNotificationCount?empid=${empId}&fromDate=${fromDate}&toDate=${toDate}`;

    return this.getCachedAndRefresh(cacheKey, hasCachedResponse => {
      const options = (skipLoader || hasCachedResponse)
        ? { headers: new HttpHeaders({ 'X-Skip-Loader': 'true' }) }
        : {};

      return this.http.get(url, options);
    }, () => onFreshResponse?.());
  }
  getProjectById(id : any) {
    return this.http.get(`${BASE_URL}/project/getProjectById?project_id=${id}`)
  }
  getTicketsByCategory(ticketCategoryId: any): Observable<any> {
    return this.http.get<any>(`${BASE_URL}/ticket/getTicketCategoryData/${ticketCategoryId}`);
  }

}
