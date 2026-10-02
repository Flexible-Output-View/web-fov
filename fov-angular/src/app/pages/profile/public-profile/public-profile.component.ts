import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ProfileViewComponent } from '../profile-view/profile-view.component';

@Component({
  selector: 'app-public-profile',
  standalone: true,
  imports: [CommonModule, ProfileViewComponent],
  template: `<app-profile-view [username]="username"></app-profile-view>`,
})
export class PublicProfileComponent implements OnInit {
  username = '';

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.username = this.route.snapshot.paramMap.get('username') ?? '';
  }
}
