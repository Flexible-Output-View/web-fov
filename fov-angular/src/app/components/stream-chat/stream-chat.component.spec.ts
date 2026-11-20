import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StreamChatComponent } from './stream-chat.component';
import { ChatService } from '../../services/chat.service';
import { AuthService, AuthUser } from '../../services/auth.service';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { ChatMessage } from '../../models/chat';

describe('StreamChatComponent', () => {
  let component: StreamChatComponent;
  let fixture: ComponentFixture<StreamChatComponent>;
  let chatService: jasmine.SpyObj<ChatService>;
  let authService: jasmine.SpyObj<AuthService>;
  let currentUser$: BehaviorSubject<AuthUser | null>;
  let messages$: BehaviorSubject<ChatMessage[]>;
  let connected$: BehaviorSubject<boolean>;

  const mockUser: AuthUser = { id: 1, username: 'testuser' } as AuthUser;
  const mockMsg: ChatMessage = {
    id: 1, streamId: 's1', userId: 1,
    username: 'user1', message: 'Hello', createdAt: '2024-01-01T12:00:00Z',
  };

  beforeEach(async () => {
    currentUser$ = new BehaviorSubject<AuthUser | null>(null);
    messages$ = new BehaviorSubject<ChatMessage[]>([]);
    connected$ = new BehaviorSubject<boolean>(false);

    chatService = jasmine.createSpyObj(
      'ChatService',
      ['joinStream', 'leaveStream', 'sendMessage'],
      { messages$: messages$.asObservable(), connected$: connected$.asObservable() },
    );
    chatService.sendMessage.and.returnValue(of(mockMsg));

    authService = jasmine.createSpyObj('AuthService', [], {
      currentUser$: currentUser$.asObservable(),
    });

    await TestBed.configureTestingModule({
      imports: [StreamChatComponent],
      providers: [
        provideRouter([]),                                    // ← ajout
        { provide: ChatService, useValue: chatService },
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamChatComponent);
    component = fixture.componentInstance;
    component.streamId = 'test-stream';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have maxLength 500', () => {
    expect(component.maxLength).toBe(500);
  });

  // ── ngOnInit ──────────────────────────────────────────────────
  describe('ngOnInit', () => {
    it('should join stream when streamId is set', () => {
      fixture.detectChanges();
      expect(chatService.joinStream).toHaveBeenCalledWith('test-stream');
    });

    it('should not join when streamId is empty', () => {
      component.streamId = '';
      fixture.detectChanges();
      expect(chatService.joinStream).not.toHaveBeenCalled();
    });

    it('should react to currentUser$', () => {
      fixture.detectChanges();
      currentUser$.next(mockUser);
      expect(component.currentUser).toEqual(mockUser);
    });

    it('should react to messages$', () => {
      fixture.detectChanges();
      messages$.next([mockMsg]);
      expect(component.messages).toEqual([mockMsg]);
    });

    it('should react to connected$', () => {
      fixture.detectChanges();
      connected$.next(true);
      expect(component.isConnected).toBeTrue();
    });
  });

  // ── ngOnChanges ───────────────────────────────────────────────
  describe('ngOnChanges', () => {
    it('should join new stream on subsequent streamId change', () => {
      fixture.detectChanges();
      chatService.joinStream.calls.reset();
      component.ngOnChanges({
        streamId: {
          currentValue: 'new-stream', previousValue: 'test-stream',
          firstChange: false, isFirstChange: () => false,
        },
      });
      expect(chatService.joinStream).toHaveBeenCalledWith('new-stream');
    });

    it('should skip join on first change', () => {
      fixture.detectChanges();
      chatService.joinStream.calls.reset();
      component.ngOnChanges({
        streamId: {
          currentValue: 'test-stream', previousValue: undefined,
          firstChange: true, isFirstChange: () => true,
        },
      });
      expect(chatService.joinStream).not.toHaveBeenCalled();
    });
  });

  // ── ngOnDestroy ───────────────────────────────────────────────
  describe('ngOnDestroy', () => {
    it('should leave stream', () => {
      fixture.detectChanges();
      component.ngOnDestroy();
      expect(chatService.leaveStream).toHaveBeenCalled();
    });
  });

  // ── isLoggedIn / canSend ──────────────────────────────────────
  describe('isLoggedIn', () => {
    it('true when currentUser exists', () => {
      component.currentUser = mockUser;
      expect(component.isLoggedIn).toBeTrue();
    });
    it('false when null', () => {
      component.currentUser = null;
      expect(component.isLoggedIn).toBeFalse();
    });
  });

  describe('canSend', () => {
    it('true when logged in, draft non-empty, not sending', () => {
      component.currentUser = mockUser;
      component.draft = 'Hi';
      component.isSending = false;
      expect(component.canSend).toBeTrue();
    });
    it('false when not logged in', () => {
      component.currentUser = null;
      component.draft = 'Hi';
      expect(component.canSend).toBeFalse();
    });
    it('false when draft is blank', () => {
      component.currentUser = mockUser;
      component.draft = '   ';
      expect(component.canSend).toBeFalse();
    });
    it('false when isSending', () => {
      component.currentUser = mockUser;
      component.draft = 'Hi';
      component.isSending = true;
      expect(component.canSend).toBeFalse();
    });
  });

  // ── usernameColor ─────────────────────────────────────────────
  describe('usernameColor', () => {
    it('should return a valid hex color', () => {
      expect(component.usernameColor('testuser')).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('should be deterministic', () => {
      expect(component.usernameColor('alice')).toBe(component.usernameColor('alice'));
    });
  });

  // ── formatTime ────────────────────────────────────────────────
  describe('formatTime', () => {
    it('should return a time string for valid ISO', () => {
      const r = component.formatTime('2024-01-15T14:30:00Z');
      expect(r).toBeTruthy();
      expect(typeof r).toBe('string');
    });

    it('should return a string even for garbage input', () => {
      expect(typeof component.formatTime('not-a-date')).toBe('string');
    });
  });

  // ── trackByMessage ────────────────────────────────────────────
  describe('trackByMessage', () => {
    it('should stringify numeric id', () => {
      expect(component.trackByMessage(0, { ...mockMsg, id: 42 })).toBe('42');
    });
    it('should pass through string id', () => {
      expect(component.trackByMessage(0, { ...mockMsg, id: 'abc' })).toBe('abc');
    });
  });

  // ── send ──────────────────────────────────────────────────────
  describe('send', () => {
    it('should send and clear draft on success', () => {
      fixture.detectChanges();
      component.currentUser = mockUser;
      component.draft = 'Hello world';
      component.send();
      expect(chatService.sendMessage).toHaveBeenCalledWith('test-stream', 'Hello world');
      expect(component.draft).toBe('');
      expect(component.isSending).toBeFalse();
    });

    it('should not send empty draft', () => {
      component.currentUser = mockUser;
      component.draft = '   ';
      component.send();
      expect(chatService.sendMessage).not.toHaveBeenCalled();
    });

    it('should set error when not logged in', () => {
      component.currentUser = null;
      component.draft = 'Hi';
      component.send();
      expect(component.sendError).toContain('Connectez-vous');
    });

    it('should not send when already sending', () => {
      component.currentUser = mockUser;
      component.draft = 'Hi';
      component.isSending = true;
      component.send();
      expect(chatService.sendMessage).not.toHaveBeenCalled();
    });

    it('should not send when streamId empty', () => {
      component.currentUser = mockUser;
      component.draft = 'Hi';
      component.streamId = '';
      component.send();
      expect(chatService.sendMessage).not.toHaveBeenCalled();
    });

    it('should set sendError on HTTP failure', () => {
      chatService.sendMessage.and.returnValue(throwError(() => new Error('Network')));
      fixture.detectChanges();
      component.currentUser = mockUser;
      component.draft = 'Hi';
      component.send();
      expect(component.sendError).toBe('Network');
      expect(component.isSending).toBeFalse();
    });
  });

  // ── onKeydown ─────────────────────────────────────────────────
  describe('onKeydown', () => {
    it('should send on Enter without Shift', () => {
      spyOn(component, 'send');
      const ev = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
      spyOn(ev, 'preventDefault');
      component.onKeydown(ev);
      expect(ev.preventDefault).toHaveBeenCalled();
      expect(component.send).toHaveBeenCalled();
    });

    it('should not send on Shift+Enter', () => {
      spyOn(component, 'send');
      component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
      expect(component.send).not.toHaveBeenCalled();
    });

    it('should ignore other keys', () => {
      spyOn(component, 'send');
      component.onKeydown(new KeyboardEvent('keydown', { key: 'a' }));
      expect(component.send).not.toHaveBeenCalled();
    });
  });

  // ── onScroll ──────────────────────────────────────────────────
  describe('onScroll', () => {
    function makeEl(scrollH: number, scrollT: number, clientH: number) {
      const el = document.createElement('div');
      Object.defineProperty(el, 'scrollHeight', { value: scrollH });
      Object.defineProperty(el, 'scrollTop', { value: scrollT });
      Object.defineProperty(el, 'clientHeight', { value: clientH });
      return el;
    }

    it('should flag shouldScrollToBottom when near bottom', () => {
      (component as any).messagesScroll = { nativeElement: makeEl(1000, 950, 100) };
      (component as any).shouldScrollToBottom = false;
      component.onScroll();
      expect((component as any).shouldScrollToBottom).toBeTrue();
    });

    it('should not flag when far from bottom', () => {
      (component as any).messagesScroll = { nativeElement: makeEl(1000, 100, 100) };
      (component as any).shouldScrollToBottom = false;
      component.onScroll();
      expect((component as any).shouldScrollToBottom).toBeFalse();
    });

    it('should not throw when messagesScroll is undefined', () => {
      (component as any).messagesScroll = undefined;
      expect(() => component.onScroll()).not.toThrow();
    });
  });
});
