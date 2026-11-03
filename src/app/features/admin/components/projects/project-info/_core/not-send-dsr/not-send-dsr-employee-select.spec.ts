import { FormControl } from '@angular/forms';
import { NotSendDsrComponent } from './not-send-dsr.component';

describe('Not Send DSR employee selector', () => {
  function createComponent(): any {
    const component = Object.create(NotSendDsrComponent.prototype) as any;
    component.allEmployeesValue = '__all_employees__';
    component.myControl = new FormControl(component.allEmployeesValue);
    component.employeeFilterControl = new FormControl('');
    component.employeeList = [
      { id: 10, employee_name: 'Asha Kumar', email: 'asha@example.com' },
      { id: 20, employee_name: 'Ravi Shah', email: 'ravi@example.com' }
    ];
    component.selected_emp_id = null;
    component.selectedEmployeeName = null;
    component.getNotsendTasksOverview = jasmine.createSpy('getNotsendTasksOverview');
    return component;
  }

  it('filters employee options by name or email and returns no matches for an unknown query', () => {
    const component = createComponent();

    expect(component.filterEmployeeOptions('asha').map((employee: any) => employee.id)).toEqual([10]);
    expect(component.filterEmployeeOptions('ravi@example.com').map((employee: any) => employee.id)).toEqual([20]);
    expect(component.filterEmployeeOptions('unknown')).toEqual([]);
  });

  it('filters the table when an employee is selected', () => {
    const component = createComponent();

    component.onEmployeeSelect(component.employeeList[1]);

    expect(component.selected_emp_id).toBe(20);
    expect(component.selectedEmployeeName).toBe('Ravi Shah');
    expect(component.myControl.value).toBe(component.employeeList[1]);
    expect(component.getNotsendTasksOverview).toHaveBeenCalled();
  });

  it('clears the employee filter when All Employees is selected or cleared', () => {
    const component = createComponent();
    component.selected_emp_id = 20;
    component.selectedEmployeeName = 'Ravi Shah';

    component.onEmployeeSelect(component.allEmployeesValue);
    expect(component.selected_emp_id).toBeNull();
    expect(component.selectedEmployeeName).toBeNull();
    expect(component.myControl.value).toBe(component.allEmployeesValue);

    component.selected_emp_id = 10;
    component.clearSelection();
    expect(component.selected_emp_id).toBeNull();
    expect(component.myControl.value).toBe(component.allEmployeesValue);
    expect(component.employeeFilterControl.value).toBe('');
    expect(component.getNotsendTasksOverview).toHaveBeenCalledTimes(2);
  });
});
