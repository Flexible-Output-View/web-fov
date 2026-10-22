import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UserProfile {
  id?: number;
  username: string;
  email?: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  followersCount: number;
  followingCount: number;
  isFollowing?: boolean;
}

export interface ProfileUpdates {
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
}

export interface FollowResponse {
  following: boolean;
  followersCount: number;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly API_URL = environment.apiUrl;
  private currentProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  public currentProfile$ = this.currentProfileSubject.asObservable();

  constructor(private http: HttpClient) {}

  /** Fetch the authenticated user's own profile and cache it. */
  loadProfile(): Observable<UserProfile> {
    return this.http
      .get<UserProfile>(`${this.API_URL}/users/me`)
      .pipe(tap((profile) => this.currentProfileSubject.next(profile)));
  }

  /** Fetch a public profile by username. */
  getProfileByUsername(username: string): Observable<UserProfile> {
    return this.http.get<UserProfile>(
      `${this.API_URL}/users/${encodeURIComponent(username)}`,
    );
  }

  /** Update the authenticated user's public profile fields. */
  updateProfile(updates: ProfileUpdates): Observable<UserProfile> {
    return this.http
      .put<UserProfile>(`${this.API_URL}/users/me`, updates)
      .pipe(tap((profile) => this.currentProfileSubject.next(profile)));
  }

  /** Change the authenticated user's password. */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.put<void>(`${this.API_URL}/users/me/password`, {
      currentPassword,
      newPassword,
    });
  }

  /** Permanently delete the authenticated user's account. */
  deleteAccount(password: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/users/me`, {
      body: { password },
    });
  }

  /** Fetch the users followed by the authenticated user. */
  getFollowing(): Observable<UserProfile[]> {
    return this.http.get<UserProfile[]>(`${this.API_URL}/users/me/following`);
  }

  /** Follow a user. */
  follow(username: string): Observable<FollowResponse> {
    return this.http.post<FollowResponse>(
      `${this.API_URL}/users/${encodeURIComponent(username)}/follow`,
      {},
    );
  }

  /** Unfollow a user. */
  unfollow(username: string): Observable<FollowResponse> {
    return this.http.delete<FollowResponse>(
      `${this.API_URL}/users/${encodeURIComponent(username)}/follow`,
    );
  }

  getCurrentProfile(): UserProfile | null {
    return this.currentProfileSubject.value;
  }

  clearProfile(): void {
    this.currentProfileSubject.next(null);
  }
}
