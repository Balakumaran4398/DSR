import { OverallComponent } from './overall.component';

describe('OverallComponent attendance visibility', () => {
  function componentFor(roles: { isAdmin: boolean; isManager: boolean; isEmployee: boolean }): OverallComponent {
    const component = Object.create(OverallComponent.prototype) as OverallComponent;
    (component as any).storageService = { roles };
    return component;
  }

  it('shows attendance to admins', () => {
    expect(componentFor({ isAdmin: true, isManager: false, isEmployee: false }).showAttendanceSection).toBeTrue();
  });

  it('shows attendance to managers', () => {
    expect(componentFor({ isAdmin: false, isManager: true, isEmployee: false }).showAttendanceSection).toBeTrue();
  });

  it('hides attendance from employees', () => {
    expect(componentFor({ isAdmin: false, isManager: false, isEmployee: true }).showAttendanceSection).toBeFalse();
  });

  it('hides attendance when no qualifying role is present', () => {
    expect(componentFor({ isAdmin: false, isManager: false, isEmployee: false }).showAttendanceSection).toBeFalse();
  });

  it('shows attendance when an account has both manager and employee roles', () => {
    expect(componentFor({ isAdmin: false, isManager: true, isEmployee: true }).showAttendanceSection).toBeTrue();
  });
});
