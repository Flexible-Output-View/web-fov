import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ProfileViewComponent } from '../profile-view/profile-view.component';

@Component({
  selector: 'app-public-profile',
  standalone: true,
  imports: [CommonModule, ProfileViewComponent],
  template: `<app-profile-view [username]="username"></app-profile-view>`,
})
export class PublicProfileComponent implements OnInit, OnDestroy {
  username = '';

  private destroy$ = new Subject<void>();

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    // Subscribe instead of reading the snapshot: Angular reuses this component
    // when navigating from one profile to another, so the input must update.
    this.route.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        this.username = params.get('username') ?? '';
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
