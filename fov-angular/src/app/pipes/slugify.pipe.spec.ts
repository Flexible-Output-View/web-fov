import { SlugifyPipe } from './slugify.pipe';

describe('SlugifyPipe', () => {
  let pipe: SlugifyPipe;

  beforeEach(() => {
    pipe = new SlugifyPipe();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return empty string for empty input', () => {
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform(null as any)).toBe('');
    expect(pipe.transform(undefined as any)).toBe('');
  });

  it('should convert to lowercase', () => {
    expect(pipe.transform('HELLO WORLD')).toBe('hello-world');
  });

  it('should replace spaces with hyphens', () => {
    expect(pipe.transform('just chatting')).toBe('just-chatting');
  });

  it('should replace underscores and multiple spaces with a single hyphen', () => {
    expect(pipe.transform('hello   ___  world')).toBe('hello-world');
  });

  it('should strip special characters', () => {
    expect(pipe.transform('Apex Legends! 2024? #1')).toBe('apex-legends-2024-1');
  });

  it('should trim leading and trailing hyphens', () => {
    expect(pipe.transform('---hello-world---')).toBe('hello-world');
    expect(pipe.transform('   spaces around   ')).toBe('spaces-around');
  });

  it('should handle alphanumeric strings unchanged if already slugified', () => {
    expect(pipe.transform('fortnite-2')).toBe('fortnite-2');
  });
});
