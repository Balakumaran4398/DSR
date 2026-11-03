import { FormBuilder } from '@angular/forms';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { URL as ApiUrl } from 'src/app/api.base';
import { SelfTicketFormComponent } from './self-ticket-form.component';

describe('SelfTicketFormComponent hardware ticket categories', () => {
  const formBuilder = new FormBuilder();

  function createComponent(): any {
    const component = Object.create(SelfTicketFormComponent.prototype) as any;
    component.ticketForm = formBuilder.group({
      ticketCategoryDataId: [null],
      ticket_name: ['']
    });
    component.tickets = [];
    component.filteredTickets = [];
    component.ticketSearchText = '';
    component.ticketCategoryRequestSequence = 0;
    component.data = null;
    component.authService = jasmine.createSpyObj('AuthService', ['getTicketCategory', 'getTicketsByCategory']);
    component.toasterService = jasmine.createSpyObj('ToasterService', ['error']);
    return component;
  }

  it('loads tickets using the selected category id and clears the previous ticket', () => {
    const component = createComponent();
    component.ticketForm.patchValue({ ticketCategoryDataId: 99, ticket_name: 'Old ticket' });
    component.authService.getTicketsByCategory.and.returnValue(of([
      { id: 21, name: 'Replacement remote' }
    ]));

    component.onTicketCategoryChange(2);

    expect(component.authService.getTicketsByCategory).toHaveBeenCalledOnceWith(2);
    expect(component.filteredTickets).toEqual([{ id: 21, name: 'Replacement remote' }]);
    expect(component.ticketForm.value).toEqual({
      ticketCategoryDataId: null,
      ticket_name: ''
    });
  });

  it('normalizes a wrapped category-data response before displaying tickets', () => {
    const component = createComponent();
    component.authService.getTicketsByCategory.and.returnValue(of({
      data: [
        { ticket_category_data_id: 31, ticket_name: 'Replace power supply' }
      ]
    }));

    component.onTicketCategoryChange(4);

    expect(component.filteredTickets).toEqual([
      { id: 31, name: 'Replace power supply' }
    ]);
  });

  it('stores both the selected ticket id and display name', () => {
    const component = createComponent();
    component.tickets = [{ id: 21, name: 'Replacement remote' }];

    component.onTicketSelectionChange(21);

    expect(component.ticketForm.value).toEqual({
      ticketCategoryDataId: 21,
      ticket_name: 'Replacement remote'
    });
  });

  it('keeps a Not sent DSR launch in create mode while preserving its date context', () => {
    const component = createComponent();
    component.data = {
      mode: 'create',
      source: 'not-send-dsr',
      notSentDsrDate: '2026-09-17'
    };
    component.isEditMode = false;
    spyOn<any>(component, 'patchFormData');

    component.ngOnChanges({
      data: {
        currentValue: component.data,
        previousValue: null,
        firstChange: true,
        isFirstChange: () => true
      }
    } as any);

    expect(component.isEditMode).toBeFalse();
    expect(component.data.notSentDsrDate).toBe('2026-09-17');
    expect(component.patchFormData).not.toHaveBeenCalled();
  });

  it('continues treating ticket row data as edit data', () => {
    const component = createComponent();
    component.data = { id: 17, ticket_name: 'Existing ticket' };

    expect(component.hasTicketEditData()).toBeTrue();
  });

  it('restores legacy edit data by ticket name when no detail id exists', () => {
    const component = createComponent();
    component.data = { ticket_name: 'replacement remote' };
    component.authService.getTicketsByCategory.and.returnValue(of([
      { id: 21, name: 'Replacement Remote' }
    ]));

    component.getTicketsByCategory(2, true);

    expect(component.ticketForm.value).toEqual({
      ticketCategoryDataId: 21,
      ticket_name: 'Replacement Remote'
    });
  });

  it('ignores a response from a previously selected category', () => {
    const component = createComponent();
    const firstResponse = new Subject<any[]>();
    const secondResponse = new Subject<any[]>();
    component.authService.getTicketsByCategory.and.returnValues(firstResponse, secondResponse);

    component.onTicketCategoryChange(1);
    component.onTicketCategoryChange(2);
    secondResponse.next([{ id: 22, name: 'Current ticket' }]);
    firstResponse.next([{ id: 11, name: 'Stale ticket' }]);

    expect(component.filteredTickets).toEqual([{ id: 22, name: 'Current ticket' }]);
  });

  it('clears ticket state and reports the current request failure', () => {
    const component = createComponent();
    spyOn(console, 'error');
    component.tickets = [{ id: 11, name: 'Old ticket' }];
    component.filteredTickets = [...component.tickets];
    component.ticketForm.patchValue({ ticketCategoryDataId: 11, ticket_name: 'Old ticket' });
    component.authService.getTicketsByCategory.and.returnValue(
      throwError(() => new Error('request failed'))
    );

    component.getTicketsByCategory(3);

    expect(component.tickets).toEqual([]);
    expect(component.filteredTickets).toEqual([]);
    expect(component.ticketForm.value).toEqual({
      ticketCategoryDataId: null,
      ticket_name: ''
    });
    expect(component.toasterService.error).toHaveBeenCalledOnceWith('Failed to load tickets');
  });

  it('submits ticketCategoryDataId and ticketName for Hardware tickets', () => {
    const component = createComponent();
    component.isHardware = true;
    component.isEditMode = false;
    component.isSubmitting = false;
    component.submitted = false;
    component.dept = [{ id: 8, department_name: 'Hardware' }];
    component.modelNameList = [];
    component.modelCodeList = [];
    component.ticketForm = formBuilder.group({
      clientId: [4],
      project_id: [null],
      productId: [null],
      product_version: [null],
      type: [''],
      ticketCategoryId: [2],
      ticketCategoryDataId: [21],
      ticket_name: ['Replacement remote'],
      priority: [2],
      ticketDescription: ['Remote is damaged'],
      status: ['Open'],
      worked_hours: ['00:00'],
      client_comments: [''],
      solution: [''],
      count: [1],
      modelName: [null],
      modelCode: [null]
    });
    component.storageService = jasmine.createSpyObj('StorageService', [
      'getEmpId', 'getDept', 'getCompanyId'
    ]);
    component.storageService.getEmpId.and.returnValue(7);
    component.storageService.getDept.and.returnValue('Hardware');
    component.authService = jasmine.createSpyObj('AuthService', [
      'createTicket', 'refreshNotificationCount'
    ]);
    component.authService.createTicket.and.returnValue(of({ message: 'Created' }));
    component.drawerService = jasmine.createSpyObj('DrawerService', ['notifyAction']);
    component.toasterService = jasmine.createSpyObj('ToasterService', ['success', 'error']);
    component.onCancel = jasmine.createSpy('onCancel');

    component.onSubmit();

    const payload = component.authService.createTicket.calls.mostRecent().args[0];
    expect(payload.ticketCategoryDataId).toBe(21);
    expect(payload.ticketName).toBe('Replacement remote');
  });
});

describe('AuthService.getTicketsByCategory', () => {
  it('requests category data using the supplied category id', () => {
    const service = Object.create(AuthService.prototype) as any;
    service.http = jasmine.createSpyObj('HttpClient', ['get']);
    service.http.get.and.returnValue(of([]));

    service.getTicketsByCategory(3);

    expect(service.http.get).toHaveBeenCalledOnceWith(
      `${ApiUrl.BASE_URL()}/ticket/getTicketCategoryData/3`
    );
  });

  it('requests the Ticket Category list without a category id', () => {
    const service = Object.create(AuthService.prototype) as any;
    service.http = jasmine.createSpyObj('HttpClient', ['get']);
    service.http.get.and.returnValue(of([]));

    service.getTicketCategory();

    expect(service.http.get).toHaveBeenCalledOnceWith(
      `${ApiUrl.BASE_URL()}/ticket/getTicketCategory`
    );
  });
});
