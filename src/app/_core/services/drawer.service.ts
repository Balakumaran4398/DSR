import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
@Injectable({ providedIn: 'root' })
export class DrawerService {

  private state$ = new BehaviorSubject<DrawerState>({
    isOpen: false,
    type: null,
    data: null,
    formType: null
  });

  private action$ = new Subject<DrawerAction>();

  drawerState$ = this.state$.asObservable();
  drawerAction$ = this.action$.asObservable();

  open(type: DrawerType, data?: any, formType?: any) {
    this.state$.next({
      isOpen: true,
      type,
      data,
      formType: this.normalizeFormType(type, data, formType)
    });
  }

  close() {
    this.state$.next({
      isOpen: false,
      type: null,
      data: null,
      formType: null
    });
  }

  /** CALL THIS AFTER FORM SUBMIT */
  notifyAction(action: DrawerAction) {
    this.action$.next(action);
  }

  private normalizeFormType(type: DrawerType, data?: any, formType?: any): DrawerFormType {
    if (type !== 'task') {
      return null;
    }

    const rawType = `${data?.task_type ?? data?.type ?? formType ?? 'requirement'}`.trim().toLowerCase();
    return rawType.includes('bug') ? 'bug' : 'requirement';
  }
}

export type DrawerType = 'task' | 'project' | 'member' | 'teammate' | 'release' | 'phases' | 'sub-task' | 'dsr' | 'relieve' | 'mom' | 'client' | 'ticket' |'assignticket' |'products';
export type DrawerTaskFormType = 'requirement' | 'bug';
export type DrawerFormType = DrawerTaskFormType | null;

export interface DrawerAction {
  source: DrawerType;
  action: 'created' | 'updated' | 'deleted';
  payload?: any;
}

export interface DrawerState {
  isOpen: boolean;
  type: DrawerType | null;
  data: any;
  formType: DrawerFormType;
}
