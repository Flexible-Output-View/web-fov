import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { CategoryCardComponent, Category } from '../../components/category-card/category-card.component';
import { StreamService } from '../../services/stream-service.service';
import { Stream, StreamCardComponent } from '../../components/stream-card/stream-card.component';
import { TwitchService } from '../../services/twitch.service';

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [CommonModule, CategoryCardComponent, RouterModule, StreamCardComponent],
  templateUrl: './discover.component.html',
  styleUrls: ['./discover.component.scss']
})
export class DiscoverComponent implements OnInit {
  
  allCategories: Category[] = [];
  activeTab: string = 'categories';
  categoryName: string | null = null;
  streams: Stream[] = [];
  liveStreams: Stream[] = [];
  isLoadingCategories = true;

  constructor(
    private streamService: StreamService,
    private twitchService: TwitchService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      if (params['name']) {
        const slug = params['name'];
        this.categoryName = this.decodeCategorySlug(slug);
        this.streams = this.streamService.getStreamsByCategorySlug(slug);
      } else {
        this.categoryName = null;
        this.loadCategories();
        this.liveStreams = this.streamService.getLiveStreams();
      }
    });
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
      error: (error) => {
        console.error('Erreur chargement catégories:', error);
        this.allCategories = [];
        this.isLoadingCategories = false;
      }
    });
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }
}
