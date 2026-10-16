import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { UserProfile, UserService } from '../../services/user.service';

@Component({
	selector: 'app-navbar',
	standalone: true,
	imports: [CommonModule, RouterModule],
	templateUrl: './navbar.component.html',
	styleUrl: './navbar.component.scss'
})
export class NavbarComponent implements OnInit, OnDestroy {
  isDarkTheme = true;
  profile: UserProfile | null = null;
  isAuthenticated = false;

  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        // Derive the flag from the stored token, not just the cached user
        // object, so the UI stays consistent with AuthService.isAuthenticated().
        this.isAuthenticated = this.authService.isAuthenticated();
        if (user) {
          this.userService
            .loadProfile()
            .pipe(takeUntil(this.destroy$))
            .subscribe({ error: () => {} });
        } else {
          this.profile = null;
        }
      });

    this.userService.currentProfile$
      .pipe(takeUntil(this.destroy$))
      .subscribe((profile) => {
        this.profile = profile;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  logout(): void {
    this.authService.logout();
    this.userService.clearProfile();
    this.router.navigate(['/login']);
  }

  get avatarUrl(): string | null {
    return this.profile?.avatarUrl || null;
  }

  get initial(): string {
    return this.profile?.username?.charAt(0).toUpperCase() ?? '?';
  }

  toggleTheme() {
    this.isDarkTheme = !this.isDarkTheme;
    document.body.classList.toggle('theme-light');
  }
}
