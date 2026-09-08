import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';

@Injectable({
  providedIn: 'root'
})
export class StorageService {

  private ACCESS_TOKEN = 'access_token';
  private USER = 'user_data';
  private USERNAME = 'username';
  private REMEMBER_USERNAME = 'remember_username';
  private REMEMBER_PASSWORD = 'remember_password';
  private REMEMBER_ME = 'remember_me';
  private DEPT = 'department';


  private SECRET_KEY = 'YOUR_32_CHAR_SECRET_KEY_AES_256';

  constructor() { }
  getEmpName(): string | null {
    const data = sessionStorage.getItem(this.USER);
    if (!data) return null;

    try {
      const obj = JSON.parse(data);
      return obj?.employee_name ?? null;
    } catch {
      console.error("Invalid USER JSON in sessionStorage");
      return null;
    }
  }

  getDesignation(): string | null {
    const data = sessionStorage.getItem(this.USER);
    if (!data) return null;

    try {
      const obj = JSON.parse(data);
      return obj?.designation ?? null;
    } catch {
      console.error("Invalid USER JSON in sessionStorage");
      return null;
    }
  }
  // -----------------------------
  // TOKEN
  // -----------------------------
  setToken(token: string): void {
    sessionStorage.setItem(this.ACCESS_TOKEN, token);
  }

  getToken(): string | null {
    return sessionStorage.getItem(this.ACCESS_TOKEN);
  }

  clearToken(): void {
    sessionStorage.removeItem(this.ACCESS_TOKEN);
  }

  hasToken(): boolean {
    return this.getToken() !== null;
  }

  // -----------------------------
  // USER
  // -----------------------------
  setUser(user: any): void {
    sessionStorage.setItem(this.USER, JSON.stringify(user));
  }

  getUser(): any {
    const data = sessionStorage.getItem(this.USER);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      console.error("Invalid USER JSON in sessionStorage");
      return null;
    }
  }
  getEmpId(): string | null {
    const data = sessionStorage.getItem(this.USER);
    if (!data) return null;

    try {
      const obj = JSON.parse(data);
      return obj?.empid ?? null;
    } catch {
      console.error("Invalid USER JSON in sessionStorage");
      return null;
    }
  }
  setUsername(username: any): void {
    sessionStorage.setItem(this.USERNAME, username);
  }
  setDept(dept: any): void {
    sessionStorage.setItem(this.DEPT, dept);
  }
  getUsername(): any {
    const username = sessionStorage.getItem(this.USERNAME);
    return username;
  }
  getDept(): any {
    const dept = sessionStorage.getItem(this.DEPT);
    return dept;
  }
  updateUser(partialUser: any): void {
    const current = this.getUser();
    if (!current) return;
    const updatedUser = { ...current, ...partialUser };
    this.setUser(updatedUser);
  }

  hasUser(): boolean {
    return this.getUser() !== null;
  }

  getUserId(): string | number | null {
    const user = this.getUser();
    return user ? user.id || user.userId || null : null;
  }

  getCompanyId(): string | number | null {
    const user = this.getUser();
    return user ? user.companyid || user.company_id || user.id || user.userId || null : null;
  }

  clearUser(): void {
    sessionStorage.removeItem(this.USER);
  }

  // -----------------------------
  // LOGGED-IN CHECK
  // -----------------------------
  isLoggedIn(): boolean {
    return this.hasToken() && this.hasUser();
  }

  // -----------------------------
  // REMEMBER ME (SAFE)
  // -----------------------------
  rememberMe(enable: boolean) {
    localStorage.setItem(this.REMEMBER_ME, enable ? 'true' : 'false');
  }

  isRememberMe(): boolean {
    return localStorage.getItem(this.REMEMBER_ME) === 'true';
  }

  setRememberUsername(username: string): void {
    localStorage.setItem(this.REMEMBER_USERNAME, username);
  }

  getRememberUsername(): string | null {
    return localStorage.getItem(this.REMEMBER_USERNAME);
  }

  // ---- Secure AES Password Encryption ----
  setRememberPassword(password: string): void {
    const encrypted = CryptoJS.AES.encrypt(password, this.SECRET_KEY).toString();
    localStorage.setItem(this.REMEMBER_PASSWORD, encrypted);
  }

  getRememberPassword(): string | null {
    const encrypted = localStorage.getItem(this.REMEMBER_PASSWORD);
    if (!encrypted) return null;

    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, this.SECRET_KEY);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch {
      return null;
    }
  }

  clearRememberMe(): void {
    localStorage.removeItem(this.REMEMBER_USERNAME);
    localStorage.removeItem(this.REMEMBER_PASSWORD);
    localStorage.removeItem(this.REMEMBER_ME);
  }


  get roles() {
    const rolesArray = this.getRoleNames();

    return {
      isAdmin: rolesArray.includes('ROLE_ADMIN'),
      isManager: rolesArray.includes('ROLE_MANAGER'),
      isEmployee: rolesArray.includes('ROLE_EMPLOYEE')
    };
  }

  getRoleNames(): string[] {
    const user = this.getUser();
    const rawRoles = user?.roles ?? user?.role ?? user?.authorities ?? user?.permissions;
    const roles = Array.isArray(rawRoles) ? rawRoles : [rawRoles];

    return [...new Set(roles
      .flatMap(role => typeof role === 'string' ? role.split(',') : [role])
      .map(role => this.extractRoleName(role))
      .filter((role): role is string => !!role))];
  }

  hasAnyRole(allowedRoles: string[]): boolean {
    if (!allowedRoles?.length) {
      return true;
    }

    const currentRoles = this.getRoleNames();
    return allowedRoles.some(role => currentRoles.includes(this.normalizeRoleName(role)));
  }

  private extractRoleName(role: any): string | null {
    if (role && typeof role === 'object') {
      role = role.authority
        ?? role.role
        ?? role.roleName
        ?? role.role_name
        ?? role.name
        ?? role.value;
    }

    if (typeof role !== 'string' || !role.trim()) {
      return null;
    }

    return this.normalizeRoleName(role);
  }

  private normalizeRoleName(role: string): string {
    const normalizedRole = role.trim().toUpperCase().replace(/[\s-]+/g, '_');

    return ['ADMIN', 'MANAGER', 'EMPLOYEE'].includes(normalizedRole)
      ? `ROLE_${normalizedRole}`
      : normalizedRole;
  }

  // -----------------------------
  // LOGOUT (simple + clean)
  // -----------------------------
  logout(): void {
    this.clearAll();
  }

  // -----------------------------
  // CLEAR ALL
  // -----------------------------
  clearAll(): void {
    this.clearToken();
    this.clearUser();
    // this.clearRememberMe();
  }
  getTaskItem(): string | null {
    const data = sessionStorage.getItem("taskItem");
    if (!data) return null;

    try {
      const obj = JSON.parse(data);
      return obj ?? null;
    } catch {
      console.error("Invalid USER JSON in sessionStorage");
      return null;
    }
  }
  saveTaskItem(item: any) {
    if (item) {
      sessionStorage.setItem("taskItem", JSON.stringify(item))
    }
  }

  toLocalDate(date: Date | string | null): string | null {
    if (!date) return null;

    const d = (date instanceof Date) ? date : new Date(date);

    if (isNaN(d.getTime())) return null;

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
  }

}
