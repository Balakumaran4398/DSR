import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';


import { Router } from '@angular/router';
import { StorageService } from './storage.service';
import { URL } from 'src/app/api.base';
import { Observable } from 'rxjs';

const AUTH_URL = URL.AUTH_URL();
const BASE_URL = URL.BASE_URL();
@Injectable({
  providedIn: 'root'
})
export class AuthService {

  constructor(
    private http: HttpClient,
    private storageService: StorageService,
    private router: Router
  ) { }

  // -----------------------------
  // LOGIN
  // -----------------------------
  signin(payload: { username: string; password: string }) {
    return this.http.post(`${AUTH_URL}/signin`, payload);
  }

  // -----------------------------
  // LOGOUT (NO API CALL)
  // -----------------------------
  logout(): void {
    this.storageService.logout();
    this.router.navigate(['/login']);
  }

  getAllShifts() {
    return this.http.get(`${BASE_URL}/common/getallshifts`);
  }
  getAllDepartments(): Observable<any> {
    return this.http.get<any[]>(`${BASE_URL}/department/getalldepartments`);
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
    return this.http.get<any[]>(`${BASE_URL}/user/getemployeelist`);
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
    return this.http.get(`${BASE_URL}/release/releaseoverview?employee_id=${payload.employee_id}&projectid=${payload.projectid}&fromdate=${payload.fromdate}&todate=${payload.todate}`)
  }
  getReleaseOverviewListByEmp(payload: any) {
    return this.http.get(`${BASE_URL}/release/releaseoverviewList?employee_id=${payload.employee_id}&projectid=${payload.projectid}&fromdate=${payload.fromdate}&todate=${payload.todate}`)
  }

  getNotsendTasks(payload: any) {
    return this.http.get(
      `${BASE_URL}/common/getnotsenddsr?employee_id=${payload.employee_id}&selected_employee_id=${payload.selected_employee_id}&fromdate=${payload.fromdate}&todate=${payload.todate}`
    )
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
    return this.http.get(`${BASE_URL}/common/getstatuslist`);
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
  getDashboardDetailsByEmployeeId(employee_id: any, project_id: any) {
    return this.http.get(`${BASE_URL}/common/dashboarddetails?employee_id=${employee_id}&project_id=${project_id}`);
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



  getAllMails(empId: number, userId: number,fromdate:any,todate:any): Observable<any[]> {
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
    return this.http.get<any[]>(`${BASE_URL}/client/allClient`);
  }

  deleteClient(id: number) {
    return this.http.delete(`${BASE_URL}/client/deleteClient/${id}`);
  }

  getAllTickets(empId: number, userId: number, fromDate: string, toDate: string): Observable<any[]> {
    return this.http.get<any[]>(`${BASE_URL}/ticket/allTickets?empid=${empId}&userId=${userId}&fromDate=${fromDate}&toDate=${toDate}`);
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
  getAllProducts(){
    return this.http.get<any[]>(`${BASE_URL}/product/all`)
  }

  createProduct(payload : any){
    return this.http.post(`${BASE_URL}/product/create`, payload);
  }

  deleteProduct(id : number){
    return this.http.delete(`${BASE_URL}/product/delete/${id}`);
  }

  updateProduct(payload : any) {
    return this.http.post(`${BASE_URL}/product/update`,payload);
  }


}
