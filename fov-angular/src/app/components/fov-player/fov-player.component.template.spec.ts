import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FovPlayerComponent, AudioWrapper, VideoWrapper } from './fov-player.component';

describe('FovPlayerComponent template interactions', () => {
  let component: FovPlayerComponent;
  let fixture: ComponentFixture<FovPlayerComponent>;

  const createVideoWrapper = (
    index: number,
    name: string,
    x: number,
    y: number,
  ): VideoWrapper => ({
    playerId: `video-${index}`,
    track: {
      index,
      name,
      trackId: `track-${index}`,
      videoUrl: `https://example.com/${index}.m3u8`,
      isVideo: true,
      isAudio: false,
    },
    x,
    y,
    width: 300,
    height: 169,
    hls: null,
    videoElement: null,
    visible: true,
    zIndex: 100 - index,
    volume: 0,
    aspectRatio: 16 / 9,
    isReady: true,
    hasManifest: true,
    bufferEnd: 0,
    bufferStart: 0,
    isVideo: true,
    isAudio: false,
    nx: 0,
    ny: 0,
    nw: 0,
    nh: 0,
  });

  const createAudioWrapper = (): AudioWrapper => ({
    playerId: 'audio-1',
    track: {
      index: 2,
      name: 'Commentary',
      trackId: 'track-audio',
      videoUrl: 'https://example.com/audio.m3u8',
      isVideo: false,
      isAudio: true,
    },
    hls: null,
    audioElement: {
      volume: 0.5,
      muted: false,
    } as HTMLAudioElement,
    volume: 0.5,
    isReady: true,
    bufferEnd: 0,
    bufferStart: 0,
  });

  beforeEach(async () => {
    spyOn(FovPlayerComponent.prototype, 'ngAfterViewInit');

    await TestBed.configureTestingModule({
      imports: [FovPlayerComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(FovPlayerComponent);
    component = fixture.componentInstance;
    component.streamId = 'template-test';
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.removeItem('fov_layout_template-test');
  });

  function render(): void {
    fixture.detectChanges();
  }

  it('renders each video track in the multi-stream layout', () => {
    component.isLoading = false;
    component.isBufferingPhase = false;
    component.videoWrappers = [
      createVideoWrapper(0, 'Main', 10, 20),
      createVideoWrapper(1, 'Second', 340, 20),
    ];

    render();

    const videoContainers =
      fixture.nativeElement.querySelectorAll('.video-container');
    const videoElements = fixture.nativeElement.querySelectorAll('video');

    expect(videoContainers.length).toBe(2);
    expect(videoElements.length).toBe(2);
    expect(videoContainers[0].style.left).toBe('10px');
    expect(videoContainers[1].style.left).toBe('340px');
  });

  it('connects edit controls to stream visibility and layer ordering', () => {
    component.isLoading = false;
    component.isBufferingPhase = false;
    component.videoWrappers = [
      createVideoWrapper(0, 'Main', 10, 20),
      createVideoWrapper(1, 'Second', 340, 20),
    ];

    render();
    fixture.nativeElement
      .querySelector('button[aria-label="Modifier la disposition"]')
      .click();
    fixture.detectChanges();

    const hideButton = fixture.nativeElement.querySelector(
      'button[aria-label="Masquer Second"]',
    ) as HTMLButtonElement;
    hideButton.click();
    fixture.detectChanges();

    expect(component.videoWrappers[1].visible).toBeFalse();
    expect(
      fixture.nativeElement.querySelector('#videoWrapper_' +
        component.playerId +
        '_1').style.display,
    ).toBe('none');

    fixture.nativeElement
      .querySelector('button[aria-label="Descendre Main"]')
      .click();
    fixture.detectChanges();

    expect(component.videoWrappers.map((wrapper) => wrapper.track.name)).toEqual([
      'Second',
      'Main',
    ]);
  });

  it('applies volume slider changes to the matching audio track', () => {
    component.isLoading = false;
    component.isBufferingPhase = false;
    component.audioUnlocked = true;
    const audioWrapper = createAudioWrapper();
    component.audioWrappers = [audioWrapper];

    render();

    const volumeSlider = fixture.nativeElement.querySelector(
      'input[aria-label="Volume de Commentary"]',
    ) as HTMLInputElement;
    volumeSlider.value = '0.25';
    volumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(audioWrapper.volume).toBe(0.25);
    expect(audioWrapper.audioElement?.volume).toBe(0.25);
    expect(volumeSlider.getAttribute('aria-valuenow')).toBe('25');
  });

  it('wires pointer gestures to drag and resize stream tiles', () => {
    component.isLoading = false;
    component.isBufferingPhase = false;
    component.editMode = true;
    const wrapper = createVideoWrapper(0, 'Main', 100, 50);
    component.videoWrappers = [wrapper];

    render();

    const stage = fixture.nativeElement.querySelector(
      '.fov-stage',
    ) as HTMLElement;
    Object.defineProperty(stage, 'offsetWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(stage, 'offsetHeight', {
      configurable: true,
      value: 500,
    });
    spyOn(stage, 'getBoundingClientRect').and.returnValue({
      width: 1000,
      height: 500,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const videoContainer = fixture.nativeElement.querySelector(
      '.video-container',
    ) as HTMLElement;
    spyOn(videoContainer, 'setPointerCapture');
    videoContainer.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 10,
        clientY: 10,
        pointerId: 1,
      }),
    );
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 60,
        clientY: 40,
        pointerId: 1,
      }),
    );
    fixture.detectChanges();

    expect(wrapper.x).toBe(150);
    expect(wrapper.y).toBe(80);
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 1,
      }),
    );

    const resizeHandle = fixture.nativeElement.querySelector(
      '.resize-handle',
    ) as HTMLElement;
    spyOn(resizeHandle, 'setPointerCapture');
    resizeHandle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 10,
        clientY: 10,
        pointerId: 2,
      }),
    );
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 60,
        clientY: 10,
        pointerId: 2,
      }),
    );
    fixture.detectChanges();

    expect(wrapper.width).toBe(350);
    expect(wrapper.height).toBeCloseTo(350 / (16 / 9));
  });
});
