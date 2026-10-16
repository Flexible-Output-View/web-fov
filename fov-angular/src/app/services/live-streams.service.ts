import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  BehaviorSubject,
  interval,
  switchMap,
  startWith,
  catchError,
  of,
  from,
  map,
} from 'rxjs';
import { environment } from '../../environments/environment';
import * as API from '../models/APIModels';

@Injectable({
  providedIn: 'root',
})
export class LiveStreamsService {
  private readonly API_URL = environment.apiUrl;
  private readonly POLL_INTERVAL = 5000;
  private readonly MAX_POLL_ATTEMPTS = 60;

  private liveStreamsSubject = new BehaviorSubject<API.LiveStreamInfo[]>([]);
  public liveStreams$ = this.liveStreamsSubject.asObservable();

  private isPolling = false;

  constructor(private http: HttpClient) {}

  getAvailableStreams(): Observable<API.AvailableStreams> {
    return this.http.get<any>(`${this.API_URL}/streams/available`).pipe(
      map((response) => {
        const streams = (
          Array.isArray(response) ? response : response?.streams || []
        ).filter((stream: API.LiveStreamInfo) => stream.trackCount > 0);
        return {
          streams,
          streamCount: streams.length,
        };
      }),
      catchError((err) => {
        console.error('Erreur récupération streams:', err);
        return of({ streams: [], streamCount: 0 });
      }),
    );
  }

  getStreamById(streamId: string): Observable<API.LiveStreamInfo | null> {
    return this.getAvailableStreams().pipe(
      map((response) => {
        const stream = response.streams.find((s) => s.streamId === streamId);
        return stream || null;
      }),
    );
  }

  getStreamTracks(streamId: string): Observable<API.LiveStreamTrack[]> {
    return this.http.get<any>(`${this.API_URL}/streams/available`).pipe(
      switchMap((response) => {
        let tracks: API.LiveStreamTrack[] = [];

        if (Array.isArray(response)) {
          const stream = response.find(
            (s) => s.streamId === streamId && (s.trackCount ?? 0) > 0,
          );
          if (stream?.tracks) {
            tracks = stream.tracks.map((t: any, i: number) => ({
              index: i,
              name: t.name || t.trackId,
              trackId: t.trackId,
              videoUrl: t.videoUrl,
              isVideo: t.isVideo ?? true,
              isAudio: t.isAudio ?? false,
            }));
          }
        } else if (response?.streams) {
          const stream = response.streams.find(
            (s: any) => s.streamId === streamId && (s.trackCount ?? 0) > 0,
          );
          if (stream?.tracks) {
            tracks = stream.tracks.map((t: any, i: number) => ({
              index: i,
              name: t.name || t.trackId,
              trackId: t.trackId,
              videoUrl: t.videoUrl,
              isVideo: t.isVideo ?? true,
              isAudio: t.isAudio ?? false,
            }));
          }
        } else if (response?.tracks) {
          const totalDirs = response.totalDirs || 0;
          const readyCount = response.videoCount || 0;
          const pending = response.pending || 0;
          const allReady =
            totalDirs > 0 && pending === 0 && readyCount === totalDirs;
          if (allReady && response.tracks.length > 0) {
            tracks = response.tracks;
          }
        }

        if (tracks.length === 0) {
          return of([]);
        }

        return from(this.waitForPlaylistsReady(tracks)).pipe(map(() => tracks));
      }),
      catchError((err) => {
        console.error(
          `[LiveStreamsService] Error fetching tracks for stream ${streamId}:`,
          err,
        );
        return of([]);
      }),
    );
  }

  private async waitForPlaylistsReady(
    tracks: API.LiveStreamTrack[],
  ): Promise<void> {
    const tracksToCheck = tracks.filter((t) => t.videoUrl);
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const results = await Promise.all(
          tracksToCheck.map((t) =>
            fetch(t.videoUrl, { method: 'HEAD', cache: 'no-store' })
              .then((r) => r.ok)
              .catch(() => false),
          ),
        );
        if (results.every((r) => r === true)) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
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

  getCurrentStreams(): API.LiveStreamInfo[] {
    return this.liveStreamsSubject.getValue();
  }
}
