import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  login: string = '';
  password: string = '';
  errorMessage: string = '';
  isLoading: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl(this.returnUrl());
    }
  }

  /** Only allow internal absolute paths so the param cannot redirect off-site. */
  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('//')
      ? url
      : '/profile';
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';

    if (!this.login.trim() || !this.password) {
      this.errorMessage = 'Veuillez remplir tous les champs.';
      return;
    }

    this.isLoading = true;

    try {
      await firstValueFrom(
        this.authService.login(this.login.trim(), this.password),
      );
      this.router.navigateByUrl(this.returnUrl());
    } catch (err: any) {
      this.errorMessage = err?.message || 'Email ou mot de passe incorrect.';
    } finally {
      this.isLoading = false;
    }
  }
}
