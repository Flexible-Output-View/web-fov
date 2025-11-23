import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { CategoryCardComponent, Category } from '../../components/category-card/category-card.component';
import { StreamService } from '../../services/stream-service.service';
import { Stream, StreamCardComponent } from '../../components/stream-card/stream-card.component';

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

  constructor(
    private streamService: StreamService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      if (params['name']) {
        const slug = params['name'];
        this.categoryName = this.streamService.getCategoryNameBySlug(slug);
        if (this.categoryName !== null) {
          this.streams = this.streamService.getStreamsByCategory(this.categoryName);
        } else {
          this.streams = [];
        }
      } else {
        this.categoryName = null;
        this.allCategories = this.streamService.getPopularCategories();
        this.liveStreams = this.streamService.getLiveStreams();
      }
    });
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }
}
