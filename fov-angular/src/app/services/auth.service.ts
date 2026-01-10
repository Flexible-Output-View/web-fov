import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private isLoggedIn = false;

  constructor(private router: Router) {
    // Vérifier si l'utilisateur est connecté (localStorage pour l'instant)
    this.isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  }

  login(email: string, password: string): boolean {
    // Pour l'instant, simulation de login
    // Plus tard, appel API vers le backend
    console.log('Login attempt:', email);
    
    // Simule une connexion réussie
    this.isLoggedIn = true;
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userEmail', email);
    
    return true;
  }

  register(username: string, email: string, password: string): boolean {
    // Pour l'instant, simulation de register
    // Plus tard, appel API vers le backend
    console.log('Register attempt:', username, email);
    
    // Simule une inscription réussie
    this.isLoggedIn = true;
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userEmail', email);
    localStorage.setItem('username', username);
    
    return true;
  }

  logout(): void {
    this.isLoggedIn = false;
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('username');
    this.router.navigate(['/login']);
  }

  isAuthenticated(): boolean {
    return this.isLoggedIn;
  }

  getUsername(): string {
    return localStorage.getItem('username') || '';
  }

  getEmail(): string {
    return localStorage.getItem('userEmail') || '';
  }
}
