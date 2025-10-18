import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  currentSlide = 0;

  featuredStreams = [
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

  popularCategories = [
    { name: 'League of Legends', viewers: '125K', image: 'assets/category-lol.png' },
    { name: 'Just Chatting', viewers: '98K', image: 'assets/category-chat.png' },
    { name: 'Valorant', viewers: '87K', image: 'assets/category-valorant.png' },
    { name: 'Fortnite', viewers: '76K', image: 'assets/category-fortnite.png' },
    { name: 'Minecraft', viewers: '65K', image: 'assets/category-minecraft.png' },
  ];

  recommendedStreams = [
    {
      streamer: 'NewStreamer',
      title: 'Premier stream ! Supportez-moi !',
      game: 'Minecraft',
      viewers: '52',
      thumbnail: 'assets/stream-thumbnail4.png',
      avatar: 'assets/profile-avatar.png'
    },
    {
      streamer: 'Inoxtag',
      title: 'Z-Event !',
      game: 'Just Chatting',
      viewers: '120',
      thumbnail: 'assets/stream-thumbnail5.png',
      avatar: 'assets/profile-avatar.png'
    },
    {
      streamer: 'MusicLover',
      title: 'Chill beats to relax/study to',
      game: 'Music',
      viewers: '89',
      thumbnail: 'assets/stream-thumbnail6.png',
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
