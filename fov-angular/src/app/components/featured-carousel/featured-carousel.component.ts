import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Stream } from '../stream-card/stream-card.component';
import { StreamService } from '../../services/stream-service.service';

@Component({
  selector: 'app-featured-carousel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './featured-carousel.component.html',
  styleUrls: ['./featured-carousel.component.scss']
})
export class FeaturedCarouselComponent implements OnInit {
  currentSlide = 0;

  featuredStreams: Stream[] = [];

  constructor(private streamService: StreamService) {}

  ngOnInit() {
    this.featuredStreams = this.streamService.getFeaturedStreams();
  }

  nextSlide() {
    if (this.featuredStreams.length === 0) return;
    this.currentSlide = (this.currentSlide + 1) % this.featuredStreams.length;
  }

  prevSlide() {
    if (this.featuredStreams.length === 0) return;
    this.currentSlide = (this.currentSlide === 0 ? this.featuredStreams.length - 1 : this.currentSlide - 1);
  }
}
