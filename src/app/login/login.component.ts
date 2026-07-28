import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { URL } from 'src/app/api.base';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent
  implements OnInit {
  VERSION = URL.CURRENT_VERSION();
  RELEASE = URL.RELEASE_DATE()
  today = new Date();
  // State Management
  currentView: 'login' | 'register' | 'forgot' = 'login';
  isDarkMode = false;
  showPassword = false;
  showRegPassword = false;
  // Reactive Forms
  loginForm!: FormGroup;
  registerForm!: FormGroup;
  forgotForm!: FormGroup;

  constructor(

    private router: Router,
    private fb: FormBuilder,
    private storageService: StorageService,
    private authService: AuthService,
    private toaster: ToasterService
  ) { }

  ngOnInit(): void {
    this.initForms();
    this.autoFillRemembered();

    if (this.storageService.isLoggedIn()) {
      this.router.navigate(['/main/dashboard']);
    }
  }

  // Initialize all forms
  initForms() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      rememberme: ['']
    });

    this.registerForm = this.fb.group({
      fullName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  // Switch between Login, Register, Forgot
  switchView(view: 'login' | 'register' | 'forgot') {
    this.currentView = view;
  }

  toggleDarkMode(): void {
    // this.layoutService.toggleTheme();
    this.isDarkMode = !this.isDarkMode;
  }

  // Toggle Login Password Visibility
  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  // Toggle Registration Password Visibility
  toggleRegPassword() {
    this.showRegPassword = !this.showRegPassword;
  }

  // Submit handler
  onSubmit(action: string) {

    console.log(this.loginForm.value);

    // -----------------------------
    // VALIDATION BLOCK
    // -----------------------------
    if (action === 'Login' && this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    if (action === 'Registration' && this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    if (action === 'Reset' && this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    // -----------------------------
    // LOGIN BLOCK
    // -----------------------------
    if (action === 'Login') {
      const payload = this.loginForm.value;
      const user = {
        username: this.loginForm.get("email")?.value,
        password: this.loginForm.get("password")?.value
      }
      this.authService.signin(user).subscribe({
        next: (res: any) => {
          // Save token
          this.storageService.setToken(res.token);
          // Save user
          this.storageService.setUser(res);
          this.storageService.setUsername(user.username)
          this.storageService.setDept(res.department)
          
          // Handle Remember Me
          if (this.loginForm.value.rememberme) {
            this.storageService.rememberMe(true);
            this.storageService.setRememberUsername(payload.email);
            this.storageService.setRememberPassword(payload.password);
          } else {
            this.storageService.clearRememberMe();
          }
          // Redirect
          this.toaster.success('You have logged in successfully', 'Success!');
          this.router.navigate(['/main/dashboard']).then(() => {
            window.location.reload();
          });
        },
        error: (err) => {
          console.error(err);
          if (err.status == 401) {
            this.toaster.error('Invalid credentials. Please try again.', 'Login Failed!');
          } else if (err.error.message){
            this.toaster.error(err.error.message);
          }else  {
            this.toaster.error('Something went wrong. Please try again.', 'Login Failed!');
          }
        }
      });
      return; // STOP further flow
    }

    // -----------------------------
    // REGISTRATION BLOCK
    // -----------------------------
    if (action === 'Registration') {
      // TODO: call registration API
      console.log('Registration submitted');
      return;
    }

    // -----------------------------
    // RESET PASSWORD BLOCK
    // -----------------------------
    if (action === 'Reset') {
      // TODO: call forgot/reset API
      console.log('Password reset submitted');
      return;
    }
  }

  get lf() {
    return {
      email: this.loginForm.get('email'),
      password: this.loginForm.get('password')
    };
  }

  get rf() {
    return {
      fullName: this.registerForm.get('fullName'),
      email: this.registerForm.get('email'),
      password: this.registerForm.get('password')
    };
  }

  get ff() {
    return {
      email: this.forgotForm.get('email')
    };
  }

  autoFillRemembered() {
    if (this.storageService.isRememberMe()) {

      const savedEmail = this.storageService.getRememberUsername();
      const savedPassword = this.storageService.getRememberPassword();

      // Patch form values
      this.loginForm.patchValue({
        email: savedEmail,
        password: savedPassword,
        rememberme: true
      });
    }
  }







}
