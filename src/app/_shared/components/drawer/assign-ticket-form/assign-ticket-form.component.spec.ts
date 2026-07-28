import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignTicketFormComponent } from './assign-ticket-form.component';

describe('AssignTicketFormComponent', () => {
  let component: AssignTicketFormComponent;
  let fixture: ComponentFixture<AssignTicketFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AssignTicketFormComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssignTicketFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
