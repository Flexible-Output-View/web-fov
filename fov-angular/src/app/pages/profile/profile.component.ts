import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService, AuthUser } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit, OnDestroy {
  username: string = '';
  email: string = '';
  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user: AuthUser | null) => {
        if (!user) {
          this.router.navigate(['/login']);
          return;
        }
        this.username = user.username;
        this.email = user.email;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
