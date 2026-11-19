import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  BehaviorSubject,
  interval,
  switchMap,
  startWith,
  catchError,
  throwError,
  of,
  map,
} from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AvailableStreamsResponse,
  LiveStreamInfo,
} from '../models/live-stream.model';

@Injectable({
  providedIn: 'root',
})
export class LiveStreamsService {
  private readonly API_URL = environment.apiUrl;
  private readonly POLL_INTERVAL = 5000;

  private liveStreamsSubject = new BehaviorSubject<LiveStreamInfo[]>([]);
  public liveStreams$ = this.liveStreamsSubject.asObservable();

  private isPolling = false;

  constructor(private http: HttpClient) {}

  getAvailableStreams(): Observable<AvailableStreamsResponse> {
    return this.http.get<any>(`${this.API_URL}/streams/available`).pipe(
      map((response) => {
        const streams = (Array.isArray(response)
          ? response
          : response?.streams || [])
          .filter((stream: LiveStreamInfo) => stream.trackCount > 0);
        return {
          streams: streams,
          streamCount: streams.length,
        };
      }),
      catchError((err) => {
        console.error('Erreur récupération streams:', err);
        return of({ streams: [], streamCount: 0 });
      }),
    );
  }

  /**
   * Fetch one stream by its public handle (the streamer username, or a legacy
   * `u<id>` / numeric id). Uses the visibility-aware direct endpoint, so
   * unlisted links and owners opening their private stream keep working while
   * the discovery listing stays public-only.
   */
  getStreamById(streamId: string): Observable<LiveStreamInfo | null> {
    return this.http
      .get<LiveStreamInfo>(
        `${this.API_URL}/streams/${encodeURIComponent(streamId)}/live`,
      )
      .pipe(
        map((stream) =>
          stream && (stream.trackCount ?? 0) > 0 ? stream : null,
        ),
        catchError((err) => {
          // 404 simply means "not live right now"; the page retries.
          if (err?.status === 404) {
            return of(null);
          }
          return throwError(() => err);
        }),
      );
  }

  startPolling(): void {
    if (this.isPolling) return;
    this.isPolling = true;

    interval(this.POLL_INTERVAL)
      .pipe(
        startWith(0),
        switchMap(() => this.getAvailableStreams()),
      )
      .subscribe((response) => {
        this.liveStreamsSubject.next(response.streams);
      });
  }

  stopPolling(): void {
    this.isPolling = false;
  }

  getCurrentStreams(): LiveStreamInfo[] {
    return this.liveStreamsSubject.getValue();
  }
}
