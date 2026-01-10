import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
//TODO : the 2 passwords should be the same
//TODO : verify the email format
//TODO : verify password strength and length
//TODO : verify than username is unique
//TODO : verify than email is unique
//TODO : verify special characters in username
export class RegisterComponent {

  username: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  errorMessage: string = '';
  isLoading: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    // Si déjà connecté, rediriger vers profil
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/profile']);
    }
  }

  onSubmit(): void {
    this.errorMessage = '';

    // Validation
    if (!this.username || !this.email || !this.password || !this.confirmPassword) {
      this.errorMessage = 'Veuillez remplir tous les champs.';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Les mots de passe ne correspondent pas.';
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage = 'Le mot de passe doit contenir au moins 6 caractères.';
      return;
    }

    this.isLoading = true;

    // Simule un délai d'inscription
    setTimeout(() => {
      const success = this.authService.register(this.username, this.email, this.password);
      
      if (success) {
        this.router.navigate(['/profile']);
      } else {
        this.errorMessage = 'Une erreur est survenue lors de l\'inscription.';
      }
      
      this.isLoading = false;
    }, 500);
  }
}
