import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { AuthService, AuthUser } from '../../services/auth.service';
import { ChatMessage } from '../../models/chat';

/**
 * Palette de couleurs pour les usernames.
 * Chaque couleur doit atteindre ≥ 4.5:1 de contraste sur le fond sombre
 * du chat (#1a1a1a). La teinte #9147ff d'origine (~4.0:1) a été remplacée
 * par #a670ff (~4.8:1).
 */
const USERNAME_COLORS = [
  '#ff4545',
  '#1e90ff',
  '#1db954',
  '#a670ff',   // ← était #9147ff (contraste insuffisant)
  '#ff7b00',
  '#00c2a8',
  '#ff4fa3',
  '#8a9a00',
  '#00a6ff',
  '#ffbe00',
  '#b380ff',
  '#4fd1ff',
];

@Component({
  selector: 'app-stream-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './stream-chat.component.html',
  styleUrls: ['./stream-chat.component.scss'],
})
export class StreamChatComponent implements OnInit, OnChanges, OnDestroy, AfterViewChecked {
  @Input() streamId = '';

  @ViewChild('messagesScroll') private messagesScroll?: ElementRef<HTMLElement>;

  messages: ChatMessage[] = [];
  currentUser: AuthUser | null = null;
  draft = '';
  isSending = false;
  sendError = '';
  isConnected = false;

  private destroy$ = new Subject<void>();
  private shouldScrollToBottom = true;

  readonly maxLength = 500;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => (this.currentUser = user));

    this.chatService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe((messages) => {
        this.messages = messages;
        this.shouldScrollToBottom = true;
      });

    this.chatService.connected$
      .pipe(takeUntil(this.destroy$))
      .subscribe((connected) => (this.isConnected = connected));

    if (this.streamId) {
      this.chatService.joinStream(this.streamId);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['streamId'] && !changes['streamId'].firstChange) {
      const nextId: string = changes['streamId'].currentValue;
      if (nextId) {
        this.chatService.joinStream(nextId);
      }
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.chatService.leaveStream();
  }

  get isLoggedIn(): boolean {
    return !!this.currentUser;
  }

  get canSend(): boolean {
    return this.isLoggedIn && this.draft.trim().length > 0 && !this.isSending;
  }

  usernameColor(username: string): string {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
    }
    return USERNAME_COLORS[hash % USERNAME_COLORS.length];
  }

  formatTime(iso: string): string {
    try {
      const date = new Date(iso);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  trackByMessage(_index: number, message: ChatMessage): string {
    return String(message.id);
  }

  onScroll(): void {
    const el = this.messagesScroll?.nativeElement;
    if (!el) {
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    this.shouldScrollToBottom = nearBottom;
  }

  send(): void {
    const text = this.draft.trim();
    if (!text || this.isSending || !this.streamId) {
      return;
    }
    if (!this.isLoggedIn) {
      this.sendError = 'Connectez-vous pour participer au chat.';
      return;
    }
    this.isSending = true;
    this.sendError = '';
    this.chatService.sendMessage(this.streamId, text).subscribe({
      next: () => {
        this.draft = '';
        this.isSending = false;
        this.shouldScrollToBottom = true;
      },
      error: (err) => {
        this.isSending = false;
        this.sendError = err?.message || "Impossible d'envoyer le message.";
      },
    });
  }

  /**
   * Envoi uniquement sur Entrée sans Shift.
   * Shift+Entrée laisse le retour à la ligne natif de l'input.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  private scrollToBottom(): void {
    const el = this.messagesScroll?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
}
