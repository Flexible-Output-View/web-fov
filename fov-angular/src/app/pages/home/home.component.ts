import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeaturedCarouselComponent } from '../../components/featured-carousel/featured-carousel.component';
import { CategoryCardComponent, Category } from '../../components/category-card/category-card.component';
import { StreamCardComponent, Stream } from '../../components/stream-card/stream-card.component';
import { StreamService } from '../../services/stream-service.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FeaturedCarouselComponent,
    CategoryCardComponent,
    StreamCardComponent
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  popularCategories: Category[] = [];
  recommendedStreams: Stream[] = [];

  constructor(private streamService: StreamService) {}

  ngOnInit() {
    this.popularCategories = this.streamService.getPopularCategories().slice(0, 5);
    this.recommendedStreams = this.streamService.getRecommendedStreams();
  }

}
