import { FormControl, FormGroup } from '@angular/forms';
import { TaskFormComponent } from './task-form.component';

describe('TaskFormComponent version validation', () => {
  it('returns to the saved DSR context when Back to DSR is clicked', () => {
    const component = Object.create(TaskFormComponent.prototype) as any;
    const context = { entryMode: 'dsr-entries', fixedDsrDate: '2026-09-17' };
    component.data = { returnToDsrContext: context };
    component.resetTaskForm = jasmine.createSpy('resetTaskForm');
    component.drawerService = jasmine.createSpyObj('DrawerService', ['open', 'close']);

    component.onCancel();

    expect(component.resetTaskForm).toHaveBeenCalled();
    expect(component.drawerService.open).toHaveBeenCalledOnceWith('dsr', context);
    expect(component.drawerService.close).not.toHaveBeenCalled();
  });

  it('keeps ordinary task Cancel behavior and closes the drawer', () => {
    const component = Object.create(TaskFormComponent.prototype) as any;
    component.data = { mode: 'create' };
    component.resetTaskForm = jasmine.createSpy('resetTaskForm');
    component.drawerService = jasmine.createSpyObj('DrawerService', ['open', 'close']);

    component.onCancel();

    expect(component.drawerService.close).toHaveBeenCalled();
    expect(component.drawerService.open).not.toHaveBeenCalled();
  });

  function componentFor(department: unknown, user: Record<string, any> = {}): any {
    const component = Object.create(TaskFormComponent.prototype) as any;
    component.storageService = {
      getDept: () => department,
      getUser: () => user
    };
    component.taskForm = new FormGroup({
      version: new FormControl('')
    });
    return component;
  }

  it('makes version optional for the Accounts department name', () => {
    const component = componentFor('  aCcOuNtS  ');

    component.setVersionValidation();

    expect(component.isVersionRequired).toBeFalse();
    expect(component.taskForm.get('version').hasError('required')).toBeFalse();
  });

  [11, '11'].forEach(departmentId => {
    it(`makes version optional for department ID ${departmentId}`, () => {
      const component = componentFor(null, { department_id: departmentId });

      component.setVersionValidation();

      expect(component.isVersionRequired).toBeFalse();
      expect(component.taskForm.get('version').hasError('required')).toBeFalse();
    });
  });

  it('recognizes Accounts from nested department data', () => {
    const component = componentFor(null, { department: { id: '11', name: 'Accounts' } });

    component.setVersionValidation();

    expect(component.isVersionRequired).toBeFalse();
    expect(component.taskForm.valid).toBeTrue();
  });

  it('keeps version required for other departments', () => {
    const component = componentFor('Software', { department_id: 2 });

    component.setVersionValidation();

    expect(component.isVersionRequired).toBeTrue();
    expect(component.taskForm.get('version').hasError('required')).toBeTrue();
  });

  it('keeps version required when department information is unavailable', () => {
    const component = componentFor(null);

    component.setVersionValidation();

    expect(component.isVersionRequired).toBeTrue();
    expect(component.taskForm.get('version').hasError('required')).toBeTrue();
  });
});
