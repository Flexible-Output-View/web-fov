import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PublicProfileComponent } from './public-profile.component';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { BehaviorSubject, of } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { UserService, UserProfile } from '../../../services/user.service';

describe('PublicProfileComponent', () => {
  let component: PublicProfileComponent;
  let fixture: ComponentFixture<PublicProfileComponent>;
  let paramMap$: BehaviorSubject<Map<string, string>>;
  let authService: jasmine.SpyObj<AuthService>;
  let userService: jasmine.SpyObj<UserService>;

  const mockProfile: UserProfile = {
    username: 'testuser',
    avatarUrl: 'avatar.jpg',
    bio: 'Hello',
    bannerUrl: 'banner.jpg',
    followersCount: 10,
    followingCount: 5,
    isFollowing: false,
  } as UserProfile;

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject(new Map([['username', 'testuser']]));

    authService = jasmine.createSpyObj('AuthService', [
      'isAuthenticated', 'getCurrentUser', 'getUsername',
    ]);
    authService.isAuthenticated.and.returnValue(false);
    authService.getCurrentUser.and.returnValue(null);
    authService.getUsername.and.returnValue('');

    userService = jasmine.createSpyObj('UserService', [
      'getProfileByUsername', 'follow', 'unfollow',
    ]);
    userService.getProfileByUsername.and.returnValue(of(mockProfile));
    userService.follow.and.returnValue(of({ following: true, followersCount: 11 }));
    userService.unfollow.and.returnValue(of({ following: false, followersCount: 9 }));

    await TestBed.configureTestingModule({
      imports: [PublicProfileComponent, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: paramMap$.asObservable() } },
        { provide: AuthService, useValue: authService },
        { provide: UserService, useValue: userService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublicProfileComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set username from route param', () => {
    fixture.detectChanges();
    expect(component.username).toBe('testuser');
  });

  it('should update username when route param changes', () => {
    fixture.detectChanges();
    paramMap$.next(new Map([['username', 'alice']]));
    expect(component.username).toBe('alice');
  });

  it('should default to empty string when param missing', () => {
    paramMap$.next(new Map());
    fixture.detectChanges();
    expect(component.username).toBe('');
  });

  it('should complete destroy$ on destroy', () => {
    fixture.detectChanges();
    const spy = spyOn((component as any).destroy$, 'complete');
    component.ngOnDestroy();
    expect(spy).toHaveBeenCalled();
  });
});
