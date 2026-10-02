import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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

    if (this.isOwnProfile && me) {
      this.userService.loadProfile(me.username, me.email);
      this.userService.currentProfile$
        .pipe(takeUntil(this.destroy$))
        .subscribe((p) => (this.profile = p));
    } else {
      this.userService
        .getProfileByUsername(this.username)
        .pipe(takeUntil(this.destroy$))
        .subscribe((p) => {
          if (p) {
            this.profile = p;
          } else {
            this.notFound = true;
          }
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

  toggleFollow(): void {
    // TODO: implémenter la logique de follow/unfollow via un service
    this.following = !this.following;
  }
}
