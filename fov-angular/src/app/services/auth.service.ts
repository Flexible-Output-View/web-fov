import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private isLoggedIn = false;

  constructor(private router: Router) {
    this.isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  }

  login(email: string, password: string): boolean {
    // Login simulation
    console.log('Login attempt:', email);
    
    this.isLoggedIn = true;
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userEmail', email);
    
    return true;
  }

  register(username: string, email: string, password: string): boolean {
    // Register simulation
    console.log('Register attempt:', username, email);
    
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
