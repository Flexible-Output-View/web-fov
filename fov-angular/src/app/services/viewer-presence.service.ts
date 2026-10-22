import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, Subscription, of, timer } from 'rxjs';
import { catchError, filter, skip, switchMap, takeUntil } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ChatService } from './chat.service';
import { ViewerCount } from '../models/live-stream.model';

export const VISITOR_ID_KEY = 'fov_viewer_id';
export const HEARTBEAT_INTERVAL_MS = 10000;

/**
 * Tracks the current viewer on a live stream page.
 *
 * Presence is sent over HTTP (so guests without a working socket still count)
 * with an optional bearer token, which lets the backend split the audience
 * between logged-in and anonymous viewers. The local count is refreshed from
 * each heartbeat response and can be pushed instantly over the chat socket.
 */
@Injectable({ providedIn: 'root' })
export class ViewerPresenceService implements OnDestroy {
  private readonly API_URL = environment.apiUrl;
  private readonly visitorId = this.resolveVisitorId();

  private readonly countsSubject = new BehaviorSubject<ViewerCount | null>(null);
  public readonly counts$ = this.countsSubject.asObservable();

  private currentStreamId: string | null = null;
  private sessionStop$ = new Subject<void>();
  private heartbeatSub: Subscription | null = null;
  private authSub: Subscription | null = null;
  private socketSub: Subscription | null = null;

  private readonly unloadHandler = () => this.sendLeaveBeacon();

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private chatService: ChatService,
  ) {}

  get visitor(): string {
    return this.visitorId;
  }

  get streamId(): string | null {
    return this.currentStreamId;
  }

  /** Start (or keep) reporting this viewer as present on `streamId`. */
  start(streamId: string): void {
    if (!streamId || this.currentStreamId === streamId) {
      return;
    }

    this.stop();
    this.currentStreamId = streamId;
    this.countsSubject.next(null);
    this.sessionStop$ = new Subject<void>();

    this.heartbeatSub = timer(0, HEARTBEAT_INTERVAL_MS)
      .pipe(
        switchMap(() => this.sendHeartbeat(streamId)),
        takeUntil(this.sessionStop$),
      )
      .subscribe((counts) => {
        if (counts) {
          this.countsSubject.next(counts);
        }
      });

    // Re-report immediately when the user logs in or out so the backend moves
    // them between the authenticated and anonymous buckets without waiting.
    this.authSub = this.authService.currentUser$
      .pipe(
        skip(1),
        switchMap(() => this.sendHeartbeat(streamId)),
        takeUntil(this.sessionStop$),
      )
      .subscribe((counts) => {
        if (counts) {
          this.countsSubject.next(counts);
        }
      });

    this.socketSub = this.chatService.viewerCount$
      .pipe(
        filter((counts): counts is ViewerCount => !!counts && String(counts.streamId) === String(streamId)),
        takeUntil(this.sessionStop$),
      )
      .subscribe((counts) => this.countsSubject.next(counts));

    window.addEventListener('pagehide', this.unloadHandler);
  }

  /** Stop reporting presence and remove this viewer from the live count. */
  stop(): void {
    const streamId = this.currentStreamId;
    this.sessionStop$.next();
    this.sessionStop$.complete();

    this.heartbeatSub?.unsubscribe();
    this.authSub?.unsubscribe();
    this.socketSub?.unsubscribe();
    this.heartbeatSub = null;
    this.authSub = null;
    this.socketSub = null;

    this.currentStreamId = null;
    this.countsSubject.next(null);
    window.removeEventListener('pagehide', this.unloadHandler);

    if (streamId) {
      this.sendLeave(streamId);
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private sendHeartbeat(streamId: string): Observable<ViewerCount | null> {
    return this.http
      .post<ViewerCount>(
        `${this.API_URL}/streams/${encodeURIComponent(streamId)}/viewers/heartbeat`,
        { visitorId: this.visitorId },
        { headers: this.authHeaders() },
      )
      .pipe(catchError(() => of(null)));
  }

  private sendLeave(streamId: string): void {
    this.http
      .post(
        `${this.API_URL}/streams/${encodeURIComponent(streamId)}/viewers/leave`,
        { visitorId: this.visitorId },
      )
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  private sendLeaveBeacon(): void {
    const streamId = this.currentStreamId;
    if (!streamId) {
      return;
    }

    const url = `${this.API_URL}/streams/${encodeURIComponent(streamId)}/viewers/leave`;
    const body = JSON.stringify({ visitorId: this.visitorId });

    try {
      const beacon = typeof navigator !== 'undefined' ? navigator.sendBeacon : undefined;
      if (beacon && beacon.call(navigator, url, new Blob([body], { type: 'application/json' }))) {
        return;
      }
    } catch {
      // Fall through to the fetch keepalive fallback.
    }

    try {
      if (typeof fetch === 'function') {
        void fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      // Best-effort only.
    }
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    if (token) {
      return new HttpHeaders({ Authorization: `Bearer ${token}` });
    }
    return new HttpHeaders();
  }

  private resolveVisitorId(): string {
    try {
      const existing = sessionStorage.getItem(VISITOR_ID_KEY);
      if (existing) {
        return existing;
      }
      const generated = this.generateVisitorId();
      sessionStorage.setItem(VISITOR_ID_KEY, generated);
      return generated;
    } catch {
      return this.generateVisitorId();
    }
  }

  private generateVisitorId(): string {
    const cryptoObj = globalThis.crypto as Crypto | undefined;
    if (cryptoObj && typeof (cryptoObj as any).randomUUID === 'function') {
      return (cryptoObj as any).randomUUID();
    }
    return `viewer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
