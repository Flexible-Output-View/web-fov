import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent {
  username: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  errorMessage: string = '';
  isLoading: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/profile']);
    }
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';

    if (
      !this.username.trim() ||
      !this.email.trim() ||
      !this.password ||
      !this.confirmPassword
    ) {
      this.errorMessage = 'Veuillez remplir tous les champs.';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Les mots de passe ne correspondent pas.';
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage =
        'Le mot de passe doit contenir au moins 6 caractères.';
      return;
    }

    this.isLoading = true;

    try {
      await firstValueFrom(
        this.authService.register(
          this.username.trim(),
          this.email.trim(),
          this.password,
        ),
      );
      this.router.navigate(['/profile']);
    } catch (err: any) {
      this.errorMessage =
        err?.message || "Une erreur est survenue lors de l'inscription.";
    } finally {
      this.isLoading = false;
    }
  }
}
