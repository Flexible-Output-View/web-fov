import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Stream } from '../stream-card/stream-card.component';

@Component({
  selector: 'app-featured-carousel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './featured-carousel.component.html',
  styleUrls: ['./featured-carousel.component.scss']
})
export class FeaturedCarouselComponent {
  currentSlide = 0;

  featuredStreams: Stream[] = [
    {
      streamer: 'StreamerPro',
      title: 'Grand tournoi League of Legends ! 🏆',
      game: 'League of Legends',
      viewers: '1.2K',
      thumbnail: 'assets/stream-thumbnail1.png',
      avatar: 'assets/profile-avatar.png'
    },
    {
      streamer: 'GamingQueen',
      title: 'Just chatting avec la communauté 💬',
      game: 'Just Chatting',
      viewers: '856',
      thumbnail: 'assets/stream-thumbnail2.png',
      avatar: 'assets/profile-avatar.png'
    },
    {
      streamer: 'ProPlayer',
      title: 'Road to Champion - Competitive Gameplay',
      game: 'Valorant',
      viewers: '2.1K',
      thumbnail: 'assets/stream-thumbnail3.png',
      avatar: 'assets/profile-avatar.png'
    }
  ];

  nextSlide() {
    this.currentSlide = (this.currentSlide + 1) % this.featuredStreams.length;
  }

  prevSlide() {
    this.currentSlide = this.currentSlide === 0 ? this.featuredStreams.length - 1 : this.currentSlide - 1;
  }
}
