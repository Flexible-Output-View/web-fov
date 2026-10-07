import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, tap } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ChatMessage, SendChatResponse } from '../models/chat';

@Injectable({
  providedIn: 'root',
})
export class ChatService implements OnDestroy {
  private readonly API_URL = environment.apiUrl;

  private socket: Socket | null = null;
  private currentStreamId: string | null = null;

  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  public messages$ = this.messagesSubject.asObservable();

  private connectedSubject = new BehaviorSubject<boolean>(false);
  public connected$ = this.connectedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  ngOnDestroy(): void {
    this.disconnect();
  }

  get messages(): ChatMessage[] {
    return this.messagesSubject.getValue();
  }

  private socketBaseUrl(): string {
    return this.API_URL.replace(/\/api\/?$/, '');
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    if (token) {
      return new HttpHeaders({ Authorization: `Bearer ${token}` });
    }
    return new HttpHeaders();
  }

  joinStream(streamId: string): void {
    if (this.currentStreamId === streamId && this.socket?.connected) {
      return;
    }
    this.leaveStream();
    this.currentStreamId = streamId;
    // Chat is ephemeral: start empty, only messages sent while connected are shown.
    this.messagesSubject.next([]);

    this.socket = io(this.socketBaseUrl(), {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.connectedSubject.next(true);
      this.socket?.emit('join-stream', streamId);
    });

    this.socket.on('disconnect', () => {
      this.connectedSubject.next(false);
    });

    this.socket.on('chat-message', (message: ChatMessage) => {
      if (!message || message.streamId !== this.currentStreamId) {
        // Still accept messages without streamId check when single-room usage.
        if (message && this.currentStreamId && message.streamId && message.streamId !== this.currentStreamId) {
          return;
        }
      }
      this.appendMessage(message);
    });
  }

  leaveStream(): void {
    if (this.socket && this.currentStreamId) {
      this.socket.emit('leave-stream', this.currentStreamId);
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentStreamId = null;
    this.connectedSubject.next(false);
    this.messagesSubject.next([]);
  }

  disconnect(): void {
    this.leaveStream();
    this.messagesSubject.next([]);
  }

  sendMessage(streamId: string, text: string): Observable<ChatMessage | null> {
    const trimmed = (text ?? '').trim();
    if (!trimmed) {
      return of(null);
    }
    return this.http
      .post<SendChatResponse>(
        `${this.API_URL}/chat/${encodeURIComponent(streamId)}`,
        { message: trimmed.slice(0, 500) },
        { headers: this.authHeaders() },
      )
      .pipe(
        map((res) => res?.message ?? null),
        tap((message) => {
          // Server broadcasts back via Socket.IO; append immediately as fallback
          // (dedup by id) so the sender sees instant feedback even if socket lags.
          if (message) {
            this.appendMessage(message);
          }
        }),
        catchError((err) => {
          console.error('[Chat] send error:', err);
          throw err;
        }),
      );
  }

  private appendMessage(message: ChatMessage): void {
    const current = this.messagesSubject.getValue();
    if (current.some((m) => String(m.id) === String(message.id))) {
      return;
    }
    const next = [...current, message].slice(-200);
    this.messagesSubject.next(next);
  }
}
