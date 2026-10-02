import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
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
export class NavbarComponent {
  isDarkTheme = true;
  profile: UserProfile | null = null;
  isAuthenticated = false;

  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private userService: UserService,
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        this.isAuthenticated = !!user;
        if (user) {
          this.userService.loadProfile(user.username, user.email);
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
