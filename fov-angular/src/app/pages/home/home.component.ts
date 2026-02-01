import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeaturedCarouselComponent } from '../../components/featured-carousel/featured-carousel.component';
import { CategoryCardComponent, Category } from '../../components/category-card/category-card.component';
import { StreamCardComponent, Stream } from '../../components/stream-card/stream-card.component';
import { FovPlayerComponent, Track } from '../../components/fov-player/fov-player.component';
import { StreamService } from '../../services/stream-service.service';
import { TwitchService } from '../../services/twitch.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FeaturedCarouselComponent,
    CategoryCardComponent,
    StreamCardComponent,
    FovPlayerComponent
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  popularCategories: Category[] = [];
  recommendedStreams: Stream[] = [];
  isLoadingCategories = true;

  // Tracks pour le mode local (tests)
  localTracks: Track[] = [
    { index: 0, name: 'first', videoUrl: 'first.m3u8' },
    { index: 1, name: 'second', videoUrl: 'second.m3u8' }
  ];

  constructor(
    private streamService: StreamService,
    private twitchService: TwitchService
  ) {}

  ngOnInit() {
    this.recommendedStreams = this.streamService.getRecommendedStreams();
    this.loadCategories();
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
}
