import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks, flush } from '@angular/core/testing';
import { SidebarComponent } from './sidebar.component';
import { LiveStreamsService } from '../../services/live-streams.service';
import { of } from 'rxjs';

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;
  let liveStreamsService: jasmine.SpyObj<LiveStreamsService>;

  /** Configure window.matchMedia avec un mock contrôlable, réutilisable. */
  function setMatchMedia(matches: boolean) {
    const mql = {
      matches,
      media: '',
      onchange: null,
      addListener: jasmine.createSpy('addListener'),
      removeListener: jasmine.createSpy('removeListener'),
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
    } as any;

    if ((window.matchMedia as any).and) {
      // déjà spyké → on change juste le comportement
      (window.matchMedia as jasmine.Spy).and.returnValue(mql);
    } else {
      spyOn(window, 'matchMedia').and.returnValue(mql);
    }
    return mql;
  }

  beforeEach(async () => {
    setMatchMedia(false);

    liveStreamsService = jasmine.createSpyObj('LiveStreamsService', ['getAvailableStreams']);
    liveStreamsService.getAvailableStreams.and.returnValue(
      of({ streams: [], streamCount: 0 }),
    );

    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [{ provide: LiveStreamsService, useValue: liveStreamsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
  });

  // ← wrapper dans fakeAsync pour autoriser discardPeriodicTasks/flush
  afterEach(fakeAsync(() => {
    discardPeriodicTasks();
    flush();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should detect narrow viewport', fakeAsync(() => {
      setMatchMedia(true);            // remplace le spy par un nouveau comportement
      component.ngOnInit();
      tick();
      expect(component.isNarrow).toBeTrue();
    }));

    it('should fetch streams immediately', fakeAsync(() => {
      component.ngOnInit();
      tick();
      expect(liveStreamsService.getAvailableStreams).toHaveBeenCalledTimes(1);
    }));

    it('should poll every 15 s', fakeAsync(() => {
      component.ngOnInit();
      tick();
      expect(liveStreamsService.getAvailableStreams).toHaveBeenCalledTimes(1);
      tick(15_000);
      expect(liveStreamsService.getAvailableStreams).toHaveBeenCalledTimes(2);
    }));
  });

  describe('ngOnDestroy', () => {
    it('should remove media listener and complete destroy$', fakeAsync(() => {
      component.ngOnInit();
      tick();
      const mql = (component as any).mql;
      component.ngOnDestroy();
      expect(mql.removeEventListener).toHaveBeenCalledWith('change', jasmine.any(Function));
    }));
  });

  describe('onToggleCollapse', () => {
    it('should emit toggleCollapse', () => {
      spyOn(component.toggleCollapse, 'emit');
      component.onToggleCollapse();
      expect(component.toggleCollapse.emit).toHaveBeenCalled();
    });
  });

  describe('isVisuallyCollapsed', () => {
    it('true when isCollapsed', () => {
      component.isCollapsed = true;
      component.isNarrow = false;
      expect(component.isVisuallyCollapsed).toBeTrue();
    });

    it('true when isNarrow', () => {
      component.isCollapsed = false;
      component.isNarrow = true;
      expect(component.isVisuallyCollapsed).toBeTrue();
    });

    it('false when both false', () => {
      component.isCollapsed = false;
      component.isNarrow = false;
      expect(component.isVisuallyCollapsed).toBeFalse();
    });
  });

  describe('onMediaChange', () => {
    it('should update isNarrow', fakeAsync(() => {
      component.ngOnInit();
      tick();
      const handler = (component as any).onMediaChange;
      handler({ matches: true } as MediaQueryListEvent);
      expect(component.isNarrow).toBeTrue();
      handler({ matches: false } as MediaQueryListEvent);
      expect(component.isNarrow).toBeFalse();
    }));
  });
});
