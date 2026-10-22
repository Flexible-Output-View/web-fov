import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UserService } from './user.service';
import { environment } from '../../environments/environment';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

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

  it('follows a user through the profile endpoint', (done) => {
    service.follow('alice').subscribe({
      next: (response) => {
        expect(response).toEqual({ following: true, followersCount: 4 });
        done();
      },
      error: (err) => done.fail(err),
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/users/alice/follow`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ following: true, followersCount: 4 });
  });

  it('unfollows a user through the profile endpoint', (done) => {
    service.unfollow('alice').subscribe({
      next: (response) => {
        expect(response).toEqual({ following: false, followersCount: 3 });
        done();
      },
      error: (err) => done.fail(err),
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/users/alice/follow`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ following: false, followersCount: 3 });
  });

  it('fetches the users followed by the current account', (done) => {
    const following = [
      {
        id: 2,
        username: 'alice',
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
        done();
      },
      error: (err) => done.fail(err),
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/users/me/following`);
    expect(req.request.method).toBe('GET');
    req.flush(following);
  });

  it('deletes the account with the password in the request body', (done) => {
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
