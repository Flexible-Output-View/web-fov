import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { UserProfile, UserService } from '../../../services/user.service';

@Component({
  selector: 'app-profile-view',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './profile-view.component.html',
  styleUrls: ['./profile-view.component.scss'],
})
export class ProfileViewComponent implements OnInit, OnDestroy {
  @Input() username!: string;

  profile: UserProfile | null = null;
  isOwnProfile = false;
  isAuthenticated = false;
  notFound = false;
  following = false;
  errorMessage = '';

  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.isAuthenticated = this.authService.isAuthenticated();
    const me = this.authService.getCurrentUser();

    this.isOwnProfile = !!me && me.username === this.username;

    if (this.isOwnProfile) {
      this.userService.currentProfile$
        .pipe(takeUntil(this.destroy$))
        .subscribe((p) => (this.profile = p));
      this.userService
        .loadProfile()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          error: (err: HttpErrorResponse) => {
            if (err.status === 404) {
              this.notFound = true;
            } else {
              this.errorMessage = 'Impossible de charger le profil.';
            }
          },
        });
    } else {
      this.userService
        .getProfileByUsername(this.username)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (p) => {
            this.profile = p;
            this.following = !!p.isFollowing;
          },
          error: (err: HttpErrorResponse) => {
            if (err.status === 404) {
              this.notFound = true;
            }
          },
        });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goToSettings(): void {
    this.router.navigate(['/profile/personal_settings']);
  }

  logout(): void {
    this.authService.logout();
    this.userService.clearProfile();
    this.router.navigate(['/login']);
  }

  toggleFollow(): void {
    const previous = this.following;
    this.following = !previous;

    const request$ = this.following
      ? this.userService.follow(this.username)
      : this.userService.unfollow(this.username);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => (this.following = res.following),
      error: () => (this.following = previous),
    });
  }
}
