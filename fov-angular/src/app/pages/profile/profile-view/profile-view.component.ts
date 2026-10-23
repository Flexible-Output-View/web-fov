import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { UserProfile, UserService } from '../../../services/user.service';

const FOLLOW_FEEDBACK_DURATION = 3000;

@Component({
  selector: 'app-profile-view',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './profile-view.component.html',
  styleUrls: ['./profile-view.component.scss'],
})
export class ProfileViewComponent implements OnInit, OnChanges, OnDestroy {
  @Input() username!: string;

  profile: UserProfile | null = null;
  isOwnProfile = false;
  isAuthenticated = false;
  notFound = false;
  following = false;
  isFollowPending = false;
  feedbackMessage = '';
  feedbackError = '';
  errorMessage = '';

  private destroy$ = new Subject<void>();
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private loadSequence = 0;

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    if (this.username) {
      this.loadProfile();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['username'] && !changes['username'].firstChange) {
      this.loadProfile();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearFeedbackTimer();
  }

  private loadProfile(): void {
    if (!this.username) {
      return;
    }

    this.profile = null;
    this.notFound = false;
    this.errorMessage = '';
    this.feedbackMessage = '';
    this.feedbackError = '';
    this.following = false;
    this.isFollowPending = false;
    this.clearFeedbackTimer();

    const sequence = ++this.loadSequence;
    this.isAuthenticated = this.authService.isAuthenticated();
    const me = this.authService.getCurrentUser();
    this.isOwnProfile =
      !!me && me.username.toLowerCase() === this.username.toLowerCase();

    if (this.isOwnProfile) {
      const cached = this.userService.getCurrentProfile();
      if (cached) {
        this.profile = cached;
      }

      this.userService
        .loadProfile()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (p) => {
            if (sequence === this.loadSequence) {
              this.profile = p;
            }
          },
          error: (err: HttpErrorResponse) => {
            if (sequence !== this.loadSequence) {
              return;
            }
            if (err.status === 404) {
              this.notFound = true;
            } else {
              this.errorMessage = 'Impossible de charger le profil.';
            }
          },
        });
      return;
    }

    this.userService
      .getProfileByUsername(this.username)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (p) => {
          if (sequence !== this.loadSequence) {
            return;
          }
          this.profile = p;
          this.following = !!p.isFollowing;
        },
        error: (err: HttpErrorResponse) => {
          if (sequence !== this.loadSequence) {
            return;
          }
          if (err.status === 404) {
            this.notFound = true;
          } else {
            this.errorMessage = 'Impossible de charger le profil.';
          }
        },
      });
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
    if (this.isFollowPending) {
      return;
    }

    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: `/${this.username}` },
      });
      return;
    }

    const previousFollowing = this.following;
    const previousFollowersCount = this.profile?.followersCount ?? 0;

    this.following = !previousFollowing;
    this.isFollowPending = true;
    this.feedbackMessage = '';
    this.feedbackError = '';
    this.clearFeedbackTimer();

    const request$ = this.following
      ? this.userService.follow(this.username)
      : this.userService.unfollow(this.username);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.following = res.following;
        if (this.profile) {
          this.profile = {
            ...this.profile,
            followersCount:
              typeof res.followersCount === 'number'
                ? res.followersCount
                : this.profile.followersCount,
          };
        }
        this.isFollowPending = false;
        this.showFeedback(
          this.following
            ? `Vous suivez maintenant ${this.username}.`
            : `Vous ne suivez plus ${this.username}.`,
        );
      },
      error: (err: HttpErrorResponse) => {
        this.following = previousFollowing;
        if (this.profile) {
          this.profile = {
            ...this.profile,
            followersCount: previousFollowersCount,
          };
        }
        this.isFollowPending = false;
        this.feedbackError =
          err.status === 401
            ? 'Connectez-vous pour suivre cet utilisateur.'
            : 'Impossible de mettre à jour l\u2019abonnement.';
      },
    });
  }

  private showFeedback(message: string): void {
    this.feedbackMessage = message;
    this.clearFeedbackTimer();
    this.feedbackTimer = setTimeout(() => {
      this.feedbackMessage = '';
      this.feedbackTimer = null;
    }, FOLLOW_FEEDBACK_DURATION);
  }

  private clearFeedbackTimer(): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
  }
}
