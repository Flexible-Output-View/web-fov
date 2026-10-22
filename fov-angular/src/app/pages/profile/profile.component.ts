import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ProfileViewComponent } from './profile-view/profile-view.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ProfileViewComponent],
  template: `<app-profile-view *ngIf="username" [username]="username"></app-profile-view>`,
})
export class ProfileComponent implements OnInit {
  username = '';

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.username = this.authService.getUsername();
  }
}
