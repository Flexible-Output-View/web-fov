import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { UserProfile, UserService } from '../../../services/user.service';
import { readImageAsDataUrl } from '../../../utils/image-upload';

@Component({
  selector: 'app-personal-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './personal-settings.component.html',
  styleUrls: ['./personal-settings.component.scss'],
})
export class PersonalSettingsComponent implements OnInit, OnDestroy {
  profile: UserProfile | null = null;

  bioDraft = '';
  avatarUrlDraft = '';
  bannerUrlDraft = '';

  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  errorMessage = '';
  successMessage = '';

  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    this.userService.currentProfile$
      .pipe(takeUntil(this.destroy$))
      .subscribe((profile) => {
        if (!profile) return;
        this.profile = profile;
        this.bioDraft = profile.bio;
        this.avatarUrlDraft = profile.avatarUrl;
        this.bannerUrlDraft = profile.bannerUrl;
      });

    this.userService
      .loadProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: (err: HttpErrorResponse) => {
          if (err.status === 401) {
            this.router.navigate(['/login']);
            return;
          }
          this.errorMessage = this.extractErrorMessage(err);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  saveProfile(): void {
    this.errorMessage = '';
    this.successMessage = '';

    if (this.bioDraft.length > 300) {
      this.errorMessage = 'La biographie ne peut pas dépasser 300 caractères.';
      return;
    }

    this.userService
      .updateProfile({
        bio: this.bioDraft,
        avatarUrl: this.avatarUrlDraft,
        bannerUrl: this.bannerUrlDraft,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Profil mis à jour.';
          setTimeout(() => (this.successMessage = ''), 2500);
        },
        error: (err: HttpErrorResponse) => {
          this.errorMessage = this.extractErrorMessage(err);
        },
      });
  }

  savePassword(): void {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.currentPassword || !this.newPassword || !this.confirmNewPassword) {
      this.errorMessage = 'Tous les champs sont obligatoires.';
      return;
    }

    if (this.newPassword !== this.confirmNewPassword) {
      this.errorMessage = 'Les nouveaux mots de passe ne correspondent pas.';
      return;
    }

    if (this.newPassword.length < 8) {
      this.errorMessage = 'Le mot de passe doit contenir au moins 8 caractères.';
      return;
    }

    if (this.newPassword === this.currentPassword) {
      this.errorMessage = 'Le nouveau mot de passe doit être différent de l\'actuel.';
      return;
    }

    this.userService
      .changePassword(this.currentPassword, this.newPassword)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Mot de passe mis à jour.';
          this.currentPassword = '';
          this.newPassword = '';
          this.confirmNewPassword = '';
          setTimeout(() => (this.successMessage = ''), 2500);
        },
        error: (err: HttpErrorResponse) => {
          this.errorMessage = this.extractErrorMessage(err);
        },
      });
  }

  cancel(): void {
    this.router.navigate(['/profile']);
  }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      this.errorMessage = '';
      const dataUrl = await readImageAsDataUrl(file, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.85,
        maxSizeKb: 2048,
      });
      this.avatarUrlDraft = dataUrl;
    } catch (err: any) {
      this.errorMessage = err?.message || 'Erreur lors du chargement de l\'image.';
    } finally {
      input.value = '';
    }
  }

  async onBannerSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      this.errorMessage = '';
      const dataUrl = await readImageAsDataUrl(file, {
        maxWidth: 1600,
        maxHeight: 400,
        quality: 0.85,
        maxSizeKb: 4096,
      });
      this.bannerUrlDraft = dataUrl;
    } catch (err: any) {
      this.errorMessage = err?.message || 'Erreur lors du chargement de l\'image.';
    } finally {
      input.value = '';
    }
  }

  removeAvatar(): void {
    this.avatarUrlDraft = '';
  }

  removeBanner(): void {
    this.bannerUrlDraft = '';
  }

  private extractErrorMessage(err: HttpErrorResponse): string {
    const body = err?.error;
    if (body?.errors && typeof body.errors === 'object') {
      const firstError = Object.values(body.errors)[0];
      if (typeof firstError === 'string') {
        return firstError;
      }
    }
    return body?.error || 'Une erreur est survenue.';
  }
}
