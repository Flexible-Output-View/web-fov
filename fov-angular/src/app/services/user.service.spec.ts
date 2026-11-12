import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { UserService, UserProfile } from './user.service';
import { environment } from '../../environments/environment';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  const mockProfile: UserProfile = {
    id: 1,
    username: 'alice',
    email: 'alice@test.com',
    bio: 'Streamer passionnée',
    avatarUrl: 'avatar.jpg',
    bannerUrl: 'banner.jpg',
    followersCount: 100,
    followingCount: 25,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UserService],
    });
    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── loadProfile ───────────────────────────────────────────────
  describe('loadProfile', () => {
    it('should fetch GET /users/me and cache profile', (done) => {
      service.loadProfile().subscribe({
        next: (profile) => {
          expect(profile).toEqual(mockProfile);
          expect(service.getCurrentProfile()).toEqual(mockProfile);
          done();
        },
        error: (err) => done.fail(err),
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users/me`);
      expect(req.request.method).toBe('GET');
      req.flush(mockProfile);
    });

    it('should push profile to currentProfile$', (done) => {
      const values: (UserProfile | null)[] = [];
      service.currentProfile$.subscribe((p) => values.push(p));

      service.loadProfile().subscribe({
        next: () => {
          // First value is null (initial), second is the loaded profile
          expect(values.length).toBe(2);
          expect(values[1]).toEqual(mockProfile);
          done();
        },
        error: (err) => done.fail(err),
      });

      httpMock.expectOne(`${environment.apiUrl}/users/me`).flush(mockProfile);
    });
  });

  // ── getProfileByUsername ──────────────────────────────────────
  describe('getProfileByUsername', () => {
    it('should fetch GET /users/:username', (done) => {
      service.getProfileByUsername('bob').subscribe({
        next: (profile) => {
          expect(profile.username).toBe('bob');
          done();
        },
        error: (err) => done.fail(err),
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users/bob`);
      expect(req.request.method).toBe('GET');
      req.flush({ ...mockProfile, username: 'bob' });
    });

    it('should encode special characters in username', (done) => {
      service.getProfileByUsername('user name').subscribe({
        next: () => done(),
        error: (err) => done.fail(err),
      });

      httpMock
        .expectOne(`${environment.apiUrl}/users/user%20name`)
        .flush(mockProfile);
    });
  });

  // ── updateProfile ─────────────────────────────────────────────
  describe('updateProfile', () => {
    it('should send PUT /users/me and update cached profile', (done) => {
      const updates = {
        bio: 'Nouvelle bio',
        avatarUrl: 'new-avatar.jpg',
        bannerUrl: 'new-banner.jpg',
      };
      const updatedProfile = { ...mockProfile, ...updates };

      service.updateProfile(updates).subscribe({
        next: (profile) => {
          expect(profile.bio).toBe('Nouvelle bio');
          expect(service.getCurrentProfile()).toEqual(updatedProfile);
          done();
        },
        error: (err) => done.fail(err),
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users/me`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updates);
      req.flush(updatedProfile);
    });
  });

  // ── changePassword ────────────────────────────────────────────
  describe('changePassword', () => {
    it('should send PUT /users/me/password with both passwords', (done) => {
      service.changePassword('oldPass', 'newPass123').subscribe({
        next: () => done(),
        error: (err) => done.fail(err),
      });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/users/me/password`,
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({
        currentPassword: 'oldPass',
        newPassword: 'newPass123',
      });
      req.flush(null, { status: 204, statusText: 'No Content' });
    });
  });

  // ── deleteAccount ─────────────────────────────────────────────
  describe('deleteAccount', () => {
    it('should send DELETE /users/me with password in body', (done) => {
      service.deleteAccount('current-secret').subscribe({
        next: () => done(),
        error: (err) => done.fail(err),
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users/me`);
      expect(req.request.method).toBe('DELETE');
      expect(req.request.body).toEqual({ password: 'current-secret' });
      req.flush({ ok: true });
    });
  });

  // ── getFollowing ──────────────────────────────────────────────
  describe('getFollowing', () => {
    it('should fetch GET /users/me/following', (done) => {
      const following: UserProfile[] = [
        {
          id: 2,
          username: 'bob',
          bio: '',
          avatarUrl: '',
          bannerUrl: '',
          followersCount: 4,
          followingCount: 1,
          isFollowing: true,
        },
      ];

      service.getFollowing().subscribe({
        next: (response) => {
          expect(response).toEqual(following);
          expect(response.length).toBe(1);
          done();
        },
        error: (err) => done.fail(err),
      });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/users/me/following`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(following);
    });
  });

  // ── follow / unfollow ─────────────────────────────────────────
  describe('follow', () => {
    it('should send POST /users/:username/follow', (done) => {
      service.follow('alice').subscribe({
        next: (response) => {
          expect(response).toEqual({ following: true, followersCount: 4 });
          done();
        },
        error: (err) => done.fail(err),
      });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/users/alice/follow`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ following: true, followersCount: 4 });
    });
  });

  describe('unfollow', () => {
    it('should send DELETE /users/:username/follow', (done) => {
      service.unfollow('alice').subscribe({
        next: (response) => {
          expect(response).toEqual({ following: false, followersCount: 3 });
          done();
        },
        error: (err) => done.fail(err),
      });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/users/alice/follow`,
      );
      expect(req.request.method).toBe('DELETE');
      req.flush({ following: false, followersCount: 3 });
    });
  });

  // ── getCurrentProfile / clearProfile ──────────────────────────
  describe('getCurrentProfile & clearProfile', () => {
    it('should return null initially', () => {
      expect(service.getCurrentProfile()).toBeNull();
    });

    it('should return cached profile after loadProfile', (done) => {
      service.loadProfile().subscribe({
        next: () => {
          expect(service.getCurrentProfile()).toEqual(mockProfile);
          done();
        },
      });
      httpMock.expectOne(`${environment.apiUrl}/users/me`).flush(mockProfile);
    });

    it('should clear profile and push null to currentProfile$', (done) => {
      // First load a profile
      service.loadProfile().subscribe({
        next: () => {
          expect(service.getCurrentProfile()).not.toBeNull();

          // Then clear
          const values: (UserProfile | null)[] = [];
          service.currentProfile$.subscribe((p) => values.push(p));
          service.clearProfile();

          expect(service.getCurrentProfile()).toBeNull();
          expect(values[values.length - 1]).toBeNull();
          done();
        },
      });
      httpMock.expectOne(`${environment.apiUrl}/users/me`).flush(mockProfile);
    });
  });
});
