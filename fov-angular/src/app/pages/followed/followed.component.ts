import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import {
  Category,
  CategoryCardComponent,
} from '../../components/category-card/category-card.component';
import { LiveStreamCardComponent } from '../../components/live-stream-card/live-stream-card.component';
import { LiveStreamInfo } from '../../models/APIModels';
import { AuthService } from '../../services/auth.service';
import { LiveStreamsService } from '../../services/live-streams.service';
import { UserService } from '../../services/user.service';

interface FollowedChannel {
  username: string;
  avatarUrl: string;
  bio: string;
  live: LiveStreamInfo | null;
}

@Component({
  selector: 'app-followed',
  standalone: true,
  imports: [CommonModule, RouterModule, LiveStreamCardComponent, CategoryCardComponent],
  templateUrl: './followed.component.html',
  styleUrls: ['./followed.component.scss'],
})
export class FollowedComponent implements OnInit, OnDestroy {
  liveChannels: LiveStreamInfo[] = [];
  offlineChannels: FollowedChannel[] = [];
  followedCategories: Category[] = [];
  activeTab = 'channels';
  isAuthenticated = false;
  isLoading = false;
  loadError = '';

  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private liveStreamsService: LiveStreamsService,
  ) {}

  ngOnInit(): void {
    this.isAuthenticated = this.authService.isAuthenticated();
    if (this.isAuthenticated) {
      this.loadFollowedChannels();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadFollowedChannels(): void {
    this.isLoading = true;
    this.loadError = '';

    forkJoin({
      following: this.userService.getFollowing(),
      available: this.liveStreamsService.getAvailableStreams(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ following, available }) => {
          const liveByUsername = new Map<string, LiveStreamInfo>();
          for (const stream of available.streams) {
            const username = (
              stream.streamerUsername ||
              stream.streamer ||
              ''
            ).toLowerCase();
            if (username) {
              liveByUsername.set(username, stream);
            }
          }

          const channels: FollowedChannel[] = following.map((user) => ({
            username: user.username,
            avatarUrl: user.avatarUrl,
            bio: user.bio,
            live: liveByUsername.get(user.username.toLowerCase()) ?? null,
          }));

          this.liveChannels = channels
            .filter((channel) => !!channel.live)
            .map((channel) => channel.live as LiveStreamInfo);
          this.offlineChannels = channels.filter((channel) => !channel.live);
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
          this.loadError = 'Impossible de charger les chaînes suivies.';
        },
      });
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }
}
