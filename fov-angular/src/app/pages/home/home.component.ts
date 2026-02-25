import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeaturedCarouselComponent } from '../../components/featured-carousel/featured-carousel.component';
import { CategoryCardComponent, Category } from '../../components/category-card/category-card.component';
import { StreamCardComponent, Stream } from '../../components/stream-card/stream-card.component';
import { LiveStreamCardComponent } from '../../components/live-stream-card/live-stream-card.component';
import { StreamService } from '../../services/stream-service.service';
import { TwitchService } from '../../services/twitch.service';
import { LiveStreamsService } from '../../services/live-streams.service';
import { LiveStreamInfo } from '../../models/live-stream.model';
import { Subject, takeUntil, interval, startWith, switchMap } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FeaturedCarouselComponent,
    CategoryCardComponent,
    StreamCardComponent,
    LiveStreamCardComponent
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  popularCategories: Category[] = [];
  recommendedStreams: Stream[] = [];
  liveStreams: LiveStreamInfo[] = [];
  
  isLoadingCategories = true;
  isLoadingLiveStreams = true;
  
  private destroy$ = new Subject<void>();
  private readonly LIVE_POLL_INTERVAL = 10000;

  constructor(
    private streamService: StreamService,
    private twitchService: TwitchService,
    private liveStreamsService: LiveStreamsService
  ) {}

  ngOnInit() {
    this.recommendedStreams = this.streamService.getRecommendedStreams();
    this.loadCategories();
    this.startLiveStreamsPolling();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCategories() {
    this.isLoadingCategories = true;

    this.twitchService.getTopCategories(5).subscribe({
      next: (categories) => {
        this.popularCategories = categories;
        this.isLoadingCategories = false;
      },
      error: (error) => {
        console.error('Erreur chargement catégories:', error);
        this.popularCategories = [];
        this.isLoadingCategories = false;
      }
    });
  }

  private startLiveStreamsPolling() {
    interval(this.LIVE_POLL_INTERVAL).pipe(
      startWith(0),
      switchMap(() => this.liveStreamsService.getAvailableStreams()),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        console.log('API Response:', response);
        this.liveStreams = response.streams || [];
        this.isLoadingLiveStreams = false;
      },
      error: (err) => {
        console.error('Erreur chargement live streams:', err);
        this.liveStreams = [];
        this.isLoadingLiveStreams = false;
      }
    });
  }

  refreshLiveStreams() {
    this.isLoadingLiveStreams = true;
    this.liveStreamsService.getAvailableStreams().subscribe({
      next: (response) => {
        this.liveStreams = response.streams;
        this.isLoadingLiveStreams = false;
      },
      error: () => {
        this.isLoadingLiveStreams = false;
      }
    });
  }
}
