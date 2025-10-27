import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeaturedCarouselComponent } from '../../components/featured-carousel/featured-carousel.component';
import { CategoryCardComponent, Category } from '../../components/category-card/category-card.component';
import { StreamCardComponent, Stream } from '../../components/stream-card/stream-card.component';

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
export class HomeComponent {

  popularCategories: Category[] = [
    { name: 'League of Legends', viewers: '125K', image: 'assets/category-lol.png' },
    { name: 'Just Chatting', viewers: '98K', image: 'assets/category-chat.png' },
    { name: 'Valorant', viewers: '87K', image: 'assets/category-valorant.png' },
    { name: 'Fortnite', viewers: '76K', image: 'assets/category-fortnite.png' },
    { name: 'Minecraft', viewers: '65K', image: 'assets/category-minecraft.png' },
  ];

  recommendedStreams: Stream[] = [
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

}
