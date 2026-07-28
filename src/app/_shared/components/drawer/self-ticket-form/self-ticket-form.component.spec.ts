import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelfTicketFormComponent } from './self-ticket-form.component';

describe('SelfTicketFormComponent', () => {
  let component: SelfTicketFormComponent;
  let fixture: ComponentFixture<SelfTicketFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SelfTicketFormComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelfTicketFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
