import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LiveStreamInfo } from '../../models/live-stream.model';

@Component({
  selector: 'app-featured-carousel',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './featured-carousel.component.html',
  styleUrls: ['./featured-carousel.component.scss']
})
export class FeaturedCarouselComponent {
  @Input() streams: LiveStreamInfo[] = [];
  @Input() isLoading = false;
  currentSlide = 0;

  nextSlide() {
    if (this.streams.length === 0) return;
    this.currentSlide = (this.currentSlide + 1) % this.streams.length;
  }

  prevSlide() {
    if (this.streams.length === 0) return;
    this.currentSlide = (this.currentSlide === 0 ? this.streams.length - 1 : this.currentSlide - 1);
  }
}
