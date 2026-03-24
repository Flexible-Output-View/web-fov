import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { CategoryCardComponent, Category } from '../../components/category-card/category-card.component';
import { LiveStreamCardComponent } from '../../components/live-stream-card/live-stream-card.component';
import { TwitchService } from '../../services/twitch.service';
import { LiveStreamsService } from '../../services/live-streams.service';
import { LiveStreamInfo } from '../../models/live-stream.model';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [CommonModule, CategoryCardComponent, RouterModule, LiveStreamCardComponent],
  templateUrl: './discover.component.html',
  styleUrls: ['./discover.component.scss']
})
export class DiscoverComponent implements OnInit, OnDestroy {
  allCategories: Category[] = [];
  activeTab: string = 'categories';
  categoryName: string | null = null;
  liveStreams: LiveStreamInfo[] = [];
  isLoadingCategories = true;
  isLoadingStreams = true;

  private destroy$ = new Subject<void>();

  constructor(
    private twitchService: TwitchService,
    private liveStreamsService: LiveStreamsService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      if (params['name']) {
        this.categoryName = this.decodeCategorySlug(params['name']);
      } else {
        this.categoryName = null;
        this.loadCategories();
        this.loadLiveStreams();
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private decodeCategorySlug(slug: string): string {
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private loadCategories() {
    this.isLoadingCategories = true;
    this.twitchService.getTopCategories(30).subscribe({
      next: (categories) => {
        this.allCategories = categories;
        this.isLoadingCategories = false;
      },
      error: () => {
        this.allCategories = [];
        this.isLoadingCategories = false;
      }
    });
  }

  private loadLiveStreams() {
    this.isLoadingStreams = true;
    this.liveStreamsService.getAvailableStreams().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.liveStreams = response.streams || [];
        this.isLoadingStreams = false;
      },
      error: () => {
        this.liveStreams = [];
        this.isLoadingStreams = false;
      }
    });
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
    if (tab === 'channels' && this.liveStreams.length === 0) {
      this.loadLiveStreams();
    }
  }
}
