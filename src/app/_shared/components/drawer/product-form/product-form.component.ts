import { Component, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { AbstractControl } from '@angular/forms';

@Component({
  selector: 'app-product-form',
  templateUrl: './product-form.component.html',
  styleUrls: ['./product-form.component.scss']
})
export class ProductFormComponent implements OnInit, OnChanges {

  @Input() data: any;

  private fb = inject(FormBuilder);

  productForm!: FormGroup;

  isEditMode = false;
  submitted = false;
  isSubmitting = false;

  versions: string[] = [];
  filteredVersions: string[] = [];
  selectedVersions: string[] = [];
  newVersion = '';
  newVersionError = false;
  versionDropdownOpen = false;
  constructor(
    private authService: AuthService,
    private drawerService: DrawerService,
    private toasterService: ToasterService
  ) {
    this.productForm = this.fb.group({
      productName: [
        '',
        [
          Validators.required,
          Validators.maxLength(200)
        ]
      ],
      version: [[], [this.versionValidator()]],
      description: ['']
    });
  }

  ngOnInit(): void {
    this.loadVersions();
    // console.log(this.data);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      if (this.data) {
        this.patchProductForm(this.data);
        this.loadVersions();
      } else {
        this.resetProductForm();
        this.loadVersions();
      }
    }
  }

  // loadVersions() {
  //   this.authService.getAllProducts()
  //     .subscribe({
  //       next: (res: any[]) => {
  //         this.versions = [
  //           ...new Set(
  //             res.flatMap(product =>
  //               product.versionList?.map((v: any) => v.version) || []
  //             )
  //           )
  //         ];
  //         this.filteredVersions = [...this.versions];
  //         if (this.data?.versionList) {
  //           this.selectedVersions = this.data.versionList.map(
  //             (v: any) => v.version
  //           );

  //           this.productForm.patchValue({
  //             version: this.selectedVersions
  //           });
  //         }
  //       },
  //       error: (err) => {
  //         console.log(err);
  //       }
  //     });
  // }

  filterVersions(value: string) {
    this.newVersion = value;

    if (!value) {
      this.filteredVersions = [...this.versions];
      return;
    }

    this.filteredVersions = this.versions.filter(version =>
      version.toLowerCase().includes(value.toLowerCase())
    );
  }
  // selectVersion(version: string) {
  //   if (!this.selectedVersions.includes(version)) {
  //     this.selectedVersions.push(version);
  //   }

  //   this.productForm.patchValue({
  //     version: this.selectedVersions
  //   });
  // }

  addVersion() {
    const version = this.newVersion.trim();

    if (!version || this.newVersionError) {
      return;
    }

    // Prevent duplicates in the array
    if (!this.selectedVersions.includes(version)) {
      this.selectedVersions = [...this.selectedVersions, version];
    }

    if (!this.versions.includes(version)) {
      this.versions.push(version);
      this.filteredVersions = [...this.versions];
    }

    // Explicitly update form control with the full array
    this.productForm.patchValue({
      version: [...this.selectedVersions]
    });
    this.productForm.get('version')?.markAsDirty();

    this.newVersion = '';
    this.newVersionError = false;
  }

  removeVersion(version: string) {
    this.selectedVersions = this.selectedVersions.filter(v => v !== version);

    // Explicitly update form control with the remaining array items
    this.productForm.patchValue({
      version: [...this.selectedVersions]
    });
    this.productForm.get('version')?.markAsDirty();
  }

  patchProductForm(data: any) {
    if (!data) return;

    this.isEditMode = true;

    this.selectedVersions = data.versionList?.map(
      (v: any) => v.version
    ) || [];

    this.productForm.patchValue({
      productName: data.productName,
      version: this.selectedVersions,
      description: data.productDescription || ''
    });

    this.submitted = false;
    this.productForm.markAsPristine();
    this.productForm.markAsUntouched();
  }

  resetProductForm() {
    this.isEditMode = false;
    this.submitted = false;
    this.isSubmitting = false;
    this.selectedVersions = [];

    this.productForm.reset({
      productName: '',
      version: [],
      description: ''
    });

    this.productForm.markAsPristine();
    this.productForm.markAsUntouched();
  }

  onCancel() {
    this.resetProductForm();
    this.drawerService.close();
  }

  onSubmit() {
    if (this.isSubmitting) return;

    this.submitted = true;

    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      this.toasterService.error(
        'Please correct the highlighted fields'
      );
      return;
    }

    const payload = {
      productName: this.productForm.value.productName,
      version: this.productForm.value.version,
      productDescription: this.productForm.value.description
    };

    this.isSubmitting = true;
    if (this.data) {
      this.updateProduct({
        ...payload,
        id: this.data.id
      });
    } else {
      this.createProduct(payload);
    }
  }

  createProduct(payload: any) {
    console.log('createProduct', payload);
    this.authService.createProduct(payload)
      .pipe(finalize(() => {
        this.isSubmitting = false;
      }))
      .subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message);

          const formattedPayload = {
            ...res,
            versionList: payload.version.map((v: string) => ({ version: v }))
          };
          this.drawerService.notifyAction({
            source: 'products',
            action: 'created',
            payload: formattedPayload
          });

          this.onCancel();
        },
        error: (err) => {
          this.toasterService.error(
            err?.error?.message || 'Failed to create product'
          );
        }
      });
  }

  updateProduct(payload: any) {
    console.log('update product', payload);
    this.authService.updateProduct(payload)
      .pipe(finalize(() => {
        this.isSubmitting = false;
      }))
      .subscribe({
      next: (res: any) => {
        this.toasterService.success(res?.message);
        this.drawerService.notifyAction({
          source: 'products',
          action: 'updated',
          payload: res
        });

        this.onCancel();
      },
      error: (err) => {
        this.toasterService.error(
          err?.error?.message || 'Failed to update product'
        );
      }
    });
  }

  showError(controlName: string, errorName?: string): boolean {
    const control = this.productForm.get(controlName);

    if (!control || !(control.touched || this.submitted)) {
      return false;
    }

    return errorName
      ? control.hasError(errorName)
      : control.invalid;
  }

  loadVersions() {
    if (this.isEditMode && this.data?.versionList) {
      this.versions = this.data.versionList.map((v: any) => v.version);
      this.filteredVersions = [...this.versions];

      this.selectedVersions = [...this.versions];

      this.productForm.patchValue({
        version: this.selectedVersions
      });
    } else if (!this.isEditMode) {
      this.filteredVersions = [...this.versions];
    } else {
      this.versions = [];
      this.filteredVersions = [];
      this.selectedVersions = [];
    }
  }

  isVersionSelected(version: string): boolean {
    return this.selectedVersions.includes(version);
  }

  versionValidator() {
    return (control: AbstractControl) => {
      if (!control.value || control.value.length === 0) {
        return null;
      }

      const regex = /^[vV]\d+(?:[.-]\d+){0,2}$/;

      const invalid = control.value.some(
        (version: string) => !regex.test(version)
      );

      return invalid ? { pattern: true } : null;
    };
  }
  onVersionInput(value: string) {
    this.newVersion = value;
    const trimmed = value.trim();

    if (!trimmed) {
      this.newVersionError = false;
    } else {
      const regex = /^[vV]\d+(?:[.-]\d+){0,2}$/;
      this.newVersionError = !regex.test(trimmed);
    }

    // Keep your existing filtering logic
    if (!trimmed) {
      this.filteredVersions = [...this.versions];
      return;
    }

    this.filteredVersions = this.versions.filter(version =>
      version.toLowerCase().includes(trimmed.toLowerCase())
    );
  }

}
