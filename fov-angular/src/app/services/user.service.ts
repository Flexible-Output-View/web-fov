import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface UserProfile {
  username: string;
  email: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  followersCount: number;
  followingCount: number;
}

const STORAGE_PREFIX = 'fov_profile_';

@Injectable({ providedIn: 'root' })
export class UserService {
  private currentProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  public currentProfile$ = this.currentProfileSubject.asObservable();

  loadProfile(username: string, email: string): void {
    const key = STORAGE_PREFIX + username;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        this.currentProfileSubject.next(JSON.parse(raw));
        return;
      } catch {}
    }
    const defaultProfile: UserProfile = {
      username,
      email,
      bio: '',
      avatarUrl: '',
      bannerUrl: '',
      followersCount: 0,
      followingCount: 0,
    };
    this.currentProfileSubject.next(defaultProfile);
  }

  getProfileByUsername(username: string): Observable<UserProfile | null> {
    const key = STORAGE_PREFIX + username;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        return new BehaviorSubject(JSON.parse(raw)).asObservable();
      } catch {}
    }
    return new BehaviorSubject<UserProfile | null>(null).asObservable();
  }

  updateProfile(updates: Partial<UserProfile>): void {
    const current = this.currentProfileSubject.value;
    if (!current) return;

    const updated = { ...current, ...updates };
    localStorage.setItem(STORAGE_PREFIX + updated.username, JSON.stringify(updated));
    this.currentProfileSubject.next(updated);
  }

  getCurrentProfile(): UserProfile | null {
    return this.currentProfileSubject.value;
    }
}
