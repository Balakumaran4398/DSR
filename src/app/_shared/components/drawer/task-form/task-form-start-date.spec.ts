import { FormControl, FormGroup } from '@angular/forms';
import { TaskFormComponent } from './task-form.component';

describe('TaskFormComponent start-date restrictions', () => {
  const today = new Date(2026, 8, 19);
  const yesterday = new Date(2026, 8, 18);
  const twoDaysAgo = new Date(2026, 8, 17);
  const tomorrow = new Date(2026, 8, 20);

  function componentFor(
    roles: { isAdmin?: boolean; isManager?: boolean; isEmployee?: boolean },
    assignedTo: string | number = 42
  ): any {
    const component = Object.create(TaskFormComponent.prototype) as any;
    component.storageService = { roles };
    component.empid = '42';
    component.todayDate = new Date(today);
    component.isEditMode = false;
    component.lockDsrDates = false;
    component.originalStartDate = null;
    component.taskForm = new FormGroup({
      assigned_to: new FormControl(assignedTo),
      start_date: new FormControl(today)
    });
    return component;
  }

  it('restricts employees to today and future dates', () => {
    const component = componentFor({ isEmployee: true });

    expect(component.isStartDateAllowed(yesterday)).toBeFalse();
    expect(component.isStartDateAllowed(today)).toBeTrue();
    expect(component.isStartDateAllowed(tomorrow)).toBeTrue();
  });

  it('restricts managers assigning to their own ID across ID types', () => {
    const component = componentFor({ isManager: true }, 42);

    expect(component.isStartDateAllowed(yesterday)).toBeFalse();
  });

  it('allows managers to use past dates for another team member', () => {
    const component = componentFor({ isManager: true }, 7);

    expect(component.isStartDateAllowed(yesterday)).toBeTrue();
  });

  it('applies the restriction when a manager switches from a teammate to themselves', () => {
    const component = componentFor({ isManager: true }, 7);
    expect(component.isStartDateAllowed(yesterday)).toBeTrue();

    component.taskForm.get('assigned_to').setValue(42);

    expect(component.isStartDateAllowed(yesterday)).toBeFalse();
  });

  it('gives admin access precedence over manager and employee restrictions', () => {
    const component = componentFor({ isAdmin: true, isManager: true, isEmployee: true });

    expect(component.isStartDateAllowed(yesterday)).toBeTrue();
  });

  it('allows only the originally saved past date while editing', () => {
    const component = componentFor({ isEmployee: true });
    component.isEditMode = true;
    component.originalStartDate = new Date(yesterday);

    expect(component.isStartDateAllowed(yesterday)).toBeTrue();
    expect(component.isStartDateAllowed(twoDaysAgo)).toBeFalse();
  });

  it('allows a locked approved DSR date in the past', () => {
    const component = componentFor({ isEmployee: true });
    component.lockDsrDates = true;

    expect(component.isStartDateAllowed(yesterday)).toBeTrue();
  });
});
