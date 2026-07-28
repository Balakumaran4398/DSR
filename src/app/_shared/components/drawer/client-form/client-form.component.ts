import { Component, inject, Input, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

@Component({
  selector: 'app-client-form',
  templateUrl: './client-form.component.html',
  styleUrls: ['./client-form.component.scss']
})
export class ClientFormComponent {

  @Input() data: any
  private fb = inject(FormBuilder);
  clientForm!: FormGroup;
  isEditMode = false;
  submitted = false;




  constructor(
    private authService: AuthService,
    private drawerService: DrawerService,
    private toasterService: ToasterService,
    private storageService: StorageService
  ) {

    this.clientForm = this.fb.group({
      companyName: ['', [Validators.required, this.trimmedRequiredValidator, Validators.maxLength(200)]],
      address: ['', [Validators.required, this.trimmedRequiredValidator, Validators.maxLength(250)]],
      city: ['', [Validators.required, this.trimmedRequiredValidator, Validators.maxLength(200), this.noNumbersValidator]],
      state: ['', [Validators.required, this.trimmedRequiredValidator, Validators.maxLength(100),]],
      pincode: ['',[
          Validators.required,
          Validators.pattern(/^[0-9]{6}$/),
          Validators.maxLength(6),
          Validators.minLength(6)]
      ],
      mobile: [
        '',
        [
          Validators.required,
          Validators.pattern(/^[0-9]{10}$/),
          Validators.maxLength(10),
          Validators.minLength(10)
        ]
      ],
      email: [
        '',
        [
          
          Validators.pattern(/^[a-zA-Z0-9_%+-]+@[a-zA-Z0-9.-]+\.(com|in)$/)
        ]
      ],
      website: [''],
      comments: ['']
    });

  }

  ngOnInit(): void {
    if (this.data) {
      this.patchCustomerForm(this.data);
    }

  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      if (this.data) {
        this.patchCustomerForm(this.data);
      }
      else {
        this.resetCustomerForm();
      }
    }
  }

  // Form Getter

  get rf() {
    return {
      companyName: this.clientForm.get('companyName'),
      address: this.clientForm.get('address'),
      city: this.clientForm.get('city'),
      state: this.clientForm.get('state'),
      // country: this.clientForm.get('country'),
      pincode: this.clientForm.get('pincode'),
      mobile: this.clientForm.get('mobile'),
      email: this.clientForm.get('email'),
      website: this.clientForm.get('website'),
      comments: this.clientForm.get('comments')
    }
  }

  // Cancel Drawer

  onCancel() {
    this.resetCustomerForm();
    this.drawerService.close();
  }

  // Reset Form

  private resetCustomerForm() {
    this.isEditMode = false;
    this.submitted = false;
    this.clientForm.reset({
      companyName: '',
      address: '',
      city: '',
      state: '',
      // country: '',
      pincode: '',
      mobile: '',
      email: '',
      website: '',
      comments: ''
    });
    this.clientForm.markAsPristine();
    this.clientForm.markAsUntouched();
  }


  // Submit

  onSubmit() {
    this.submitted = true;

    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      this.toasterService.error('Please correct the highlighted fields');
      return;
    }

    if (this.clientForm.valid) {
      const raw = this.clientForm.value;
      const payload = {
        companyName: raw.companyName,
        address: raw.address,
        city: raw.city,
        state: raw.state,
        // country: raw.country,
        pincode: raw.pincode,
        mobile: raw.mobile,
        email: raw.email,
        website: raw.website,
        comments: raw.comments,
        createdBy: this.storageService.getEmpId(),
        // createdDate: new Date().toISOString(),
        companyId: this.storageService.getCompanyId()
      };

      console.log("Customer Payload", payload);

      if (this.data && this.isEditMode) {
        const updatePayload = {
          ...payload,
          id: this.data.id
        };
        this.updateCustomer(updatePayload);
      } else {
        this.authService.createClient(payload)
          .subscribe({
            next: (res: any) => {
              this.toasterService.success(res?.message);
              this.drawerService.notifyAction({
                source: 'client',
                action: 'created',
                payload: res
              });
              this.onCancel();
            },
            error: (err: any) => {
              this.toasterService.error(
                err?.error?.message || 'Failed to create client'
              );
            }
          });
      }
    }
  }

  patchCustomerForm(data: any) {
    if (!data) return;

    this.isEditMode = true;

    this.clientForm.patchValue({
      companyName: data.company_name ?? '',
      address: data.address ?? '',
      city: data.city ?? '',
      state: data.state ?? '',
      // country: data.country ?? '',
      pincode: data.pincode ?? '',
      mobile: data.mobile ?? '',
      email: data.email ?? '',
      website: data.website ?? '',
      comments: data.comments ?? ''
    });
    this.submitted = false;
    this.clientForm.markAsPristine();
    this.clientForm.markAsUntouched();
  }

  updateCustomer(data: any) {
    this.authService.updateClient(data)
      .subscribe({
        next: (res: any) => {
          this.toasterService.success(
            res?.message
          );
          this.drawerService.notifyAction({
            source: 'client',
            action: 'updated',
            payload: res
          });
          this.onCancel();
        },
        error: (err: any) => {
          this.toasterService.error(
            err?.error?.message
          );
        }
      })
  }

  numbersOnly(event: KeyboardEvent): boolean {
    const charCode = event.which ? event.which : event.keyCode;

    // Allow only numbers
    if (charCode < 48 || charCode > 57) {
      event.preventDefault();
      return false;
    }

    return true;
  }

  limitMobile(event: any) {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 10);
    this.clientForm.get('mobile')?.setValue(event.target.value, { emitEvent: false });
  }

  limitPincode(event: any) {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
    this.clientForm.get('pincode')?.setValue(event.target.value, { emitEvent: false });
  }

  showError(controlName: string, errorName?: string): boolean {
    const control = this.clientForm.get(controlName);
    if (!control || !(control.touched || this.submitted)) {
      return false;
    }

    return errorName ? control.hasError(errorName) : control.invalid;
  }

  private trimmedRequiredValidator(control: AbstractControl): ValidationErrors | null {
    const value = `${control.value ?? ''}`.trim();
    return value ? null : { required: true };
  }

  private noNumbersValidator(control: AbstractControl): ValidationErrors | null {
    const value = `${control.value ?? ''}`;
    return /\d/.test(value) ? { numbersNotAllowed: true } : null;
  }
}
