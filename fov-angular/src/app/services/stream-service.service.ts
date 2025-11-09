import { Injectable } from '@angular/core';
import { Stream } from '../components/stream-card/stream-card.component';
import { Category } from '../components/category-card/category-card.component';

@Injectable({
  providedIn: 'root'
})
export class StreamService {

  private allCategories: Category[] = [
    { name: 'League of Legends', viewers: '125K', image: 'assets/category/leagues-of-legends.png' },
    { name: 'Just Chatting', viewers: '98K', image: 'assets/category/just-chatting.png' },
    { name: 'Valorant', viewers: '87K', image: 'assets/category/valorant.png' },
    { name: 'Fortnite', viewers: '76K', image: 'assets/category/fortnite.png' },
    { name: 'Minecraft', viewers: '65K', image: 'assets/category/minecraft.png' },
  ];

  private allStreams: Stream[] = [
    {
      streamer: 'Skyyart',
      title: 'Grand tournoi League of Legends ! 🏆',
      category: 'League of Legends',
      viewers: '91.2K',
      thumbnail: 'assets/stream-thumbnail1.png',
      avatar: 'assets/profile-avatar.png',
      isLive: true
    },
    {
      streamer: 'Domingo',
      title: 'Just chatting avec la communauté 💬',
      category: 'Just Chatting',
      viewers: '8.6K',
      thumbnail: 'assets/stream-thumbnail2.png',
      avatar: 'assets/profile-avatar.png',
      isLive: true
    },
    {
      streamer: 'Squeezie',
      title: 'Tryhard Valorant avec les potes !',
      category: 'Valorant',
      viewers: '28.1K',
      thumbnail: 'assets/stream-thumbnail3.png',
      avatar: 'assets/profile-avatar.png',
      isLive: true
    },
    {
      streamer: 'Mushway',
      title: 'Minecraft à l\'ancienne !',
      category: 'Minecraft',
      viewers: '5K',
      thumbnail: 'assets/stream-thumbnail4.png',
      avatar: 'assets/profile-avatar.png',
      isLive: true
    },
    {
      streamer: 'Inoxtag',
      title: 'Z-Event !',
      category: 'Just Chatting',
      viewers: '120K',
      thumbnail: 'assets/stream-thumbnail5.png',
      avatar: 'assets/profile-avatar.png',
      isLive: false
    },
    {
      streamer: 'Lofi Girl',
      title: 'Chill beats to relax/study to',
      category: 'Music',
      viewers: '7.2K',
      thumbnail: 'assets/stream-thumbnail6.png',
      avatar: 'assets/profile-avatar.png',
      isLive: false
    }
  ];

  constructor() { }

  getPopularCategories(): Category[] {
    return this.allCategories;
  }

  getRecommendedStreams(): Stream[] {
    return this.allStreams.slice(0, 3);
  }

  getFeaturedStreams(): Stream[] {
    return this.allStreams.filter(stream => stream.isLive).slice(0, 3);
  }

  getLiveStreams(): Stream[] {
    return this.allStreams.filter(stream => stream.isLive);
  }

  getFollowedChannels(): any[] {
    // For the moment hard code
    // Later it will come from the user's followed channels data
    return [
      { 
        streamer: 'Skyyart',
        title: 'Grand tournoi League of Legends ! 🏆',
        category: 'League of Legends',
        viewers: '91.2K',
        thumbnail: 'assets/stream-thumbnail1.png',
        avatar: 'assets/stream-thumbnail1.png',
        isLive: true
      },
      { 
        streamer: 'Domingo',
        title: 'Just chatting avec la communauté 💬',
        category: 'Just Chatting',
        viewers: '8.6K',
        thumbnail: 'assets/stream-thumbnail2.png',
        avatar: 'assets/stream-thumbnail2.png',
        isLive: true
      },
      { 
        streamer: 'Zerator',
        title: '',
        category: '',
        viewers: '',
        thumbnail: '',
        avatar: 'assets/stream-thumbnail3.png',
        isLive: false
      }
    ];
  }

  getFollowedCategories(): Category[] {
    // For the moment hard code
    // Later it will come from the user's followed categories data
    return [
      { name: 'League of Legends', viewers: '125K', image: 'assets/category/leagues-of-legends.png' },
      { name: 'Just Chatting', viewers: '98K', image: 'assets/category/just-chatting.png' },
    ];
  }

  getStreamsByCategory(categoryName: string): Stream[] {
    return this.allStreams.filter(
      stream => stream.category === categoryName && stream.isLive
    );
  }

  getCategoryNameBySlug(slug: string): string {
    const found = this.allCategories.find(c => 
      c.name.toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '') === slug
    );
    return found ? found.name : 'Catégorie inconnue';
  }
}
