import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationStart, Router, RouterModule } from '@angular/router';
import {
  Observable,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  forkJoin,
  map,
  of,
  switchMap,
  takeUntil,
} from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { UserProfile, UserSearchResult, UserService } from '../../services/user.service';
import { LiveStreamsService } from '../../services/live-streams.service';
import { LiveStreamInfo } from '../../models/live-stream.model';

export interface SearchResults {
  streams: LiveStreamInfo[];
  users: UserSearchResult[];
}

const SEARCH_LIMIT = 5;
const SEARCH_DEBOUNCE_MS = 250;

function normalize(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

@Component({
	selector: 'app-navbar',
	standalone: true,
	imports: [CommonModule, RouterModule],
	templateUrl: './navbar.component.html',
	styleUrl: './navbar.component.scss'
})
export class NavbarComponent implements OnInit, OnDestroy {
  isDarkTheme = true;
  profile: UserProfile | null = null;
  isAuthenticated = false;

  searchQuery = '';
  searchResults: SearchResults | null = null;
  isSearchOpen = false;

  private searchTerms$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private router: Router,
    private liveStreamsService: LiveStreamsService,
    private elementRef: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        // Derive the flag from the stored token, not just the cached user
        // object, so the UI stays consistent with AuthService.isAuthenticated().
        this.isAuthenticated = this.authService.isAuthenticated();
        if (user) {
          this.userService
            .loadProfile()
            .pipe(takeUntil(this.destroy$))
            .subscribe({ error: () => {} });
        } else {
          this.profile = null;
        }
      });

    this.userService.currentProfile$
      .pipe(takeUntil(this.destroy$))
      .subscribe((profile) => {
        this.profile = profile;
      });

    this.searchTerms$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((query) => this.search(query)),
        takeUntil(this.destroy$),
      )
      .subscribe((results) => {
        this.searchResults = results;
      });

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntil(this.destroy$),
      )
      .subscribe(() => this.closeSearch());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  logout(): void {
    this.authService.logout();
    this.userService.clearProfile();
    this.router.navigate(['/login']);
  }

  get avatarUrl(): string | null {
    return this.profile?.avatarUrl || null;
  }

  get initial(): string {
    return this.profile?.username?.charAt(0).toUpperCase() ?? '?';
  }

  get hasSearchResults(): boolean {
    return !!this.searchResults
      && (this.searchResults.streams.length > 0 || this.searchResults.users.length > 0);
  }

  get searchStatus(): string {
    if (!this.isSearchOpen || !this.searchQuery.trim() || !this.searchResults) return '';
    const count = this.searchResults.streams.length + this.searchResults.users.length;
    if (count === 0) return 'Aucun résultat';
    return `${count} résultat${count > 1 ? 's' : ''}`;
  }

  onSearchInput(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value;
    this.isSearchOpen = true;
    if (!this.searchQuery.trim()) this.searchResults = null;
    this.searchTerms$.next(this.searchQuery.trim());
  }

  onSearchSubmit(event: Event): void {
    event.preventDefault();
    const query = this.searchQuery.trim();
    if (!query) return;

    this.search(query)
      .pipe(takeUntil(this.destroy$))
      .subscribe((results) => {
        this.searchResults = results;
        this.isSearchOpen = true;
        const stream = results.streams[0];
        const user = results.users[0];
        if (stream) this.router.navigate(['/stream', stream.streamId]);
        else if (user) this.router.navigate(['/', user.username]);
      });
  }

  closeSearch(): void {
    this.isSearchOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const container = this.elementRef.nativeElement.querySelector('.search-container');
    if (container && !container.contains(event.target as Node)) {
      this.closeSearch();
    }
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.closeSearch();
  }

  private search(query: string): Observable<SearchResults> {
    if (!query) return of({ streams: [], users: [] });

    const needle = normalize(query);
    const streams$ = this.liveStreamsService.getAvailableStreams().pipe(
      map(({ streams }) => streams
        .filter((stream) => [stream.title, stream.streamer, stream.streamerUsername, stream.category]
          .some((field) => normalize(field).includes(needle)))
        .slice(0, SEARCH_LIMIT)),
    );
    const users$ = this.userService.searchUsers(query).pipe(catchError(() => of([])));

    return forkJoin({ streams: streams$, users: users$ });
  }

  toggleTheme() {
    this.isDarkTheme = !this.isDarkTheme;
    document.body.classList.toggle('theme-light');
  }
}
