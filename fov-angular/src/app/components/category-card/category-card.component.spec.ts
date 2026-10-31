import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoryCardComponent, Category } from './category-card.component';

describe('CategoryCardComponent', () => {
  let component: CategoryCardComponent;
  let fixture: ComponentFixture<CategoryCardComponent>;

  const mockCategory: Category = {
    name: 'Just Chatting',
    viewers: '100k',
    image: 'https://example.com/img.jpg',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CategoryCardComponent);
    component = fixture.componentInstance;
    component.category = mockCategory;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('categorySlug', () => {
    it('should lowercase and hyphenate spaces', () => {
      component.category = { ...mockCategory, name: 'Just Chatting' };
      expect(component.categorySlug).toBe('just-chatting');
    });

    it('should strip special characters', () => {
      component.category = { ...mockCategory, name: 'Hello! World?' };
      expect(component.categorySlug).toBe('hello-world');
    });

    it('should collapse multiple separators', () => {
      component.category = { ...mockCategory, name: 'A   B__C--D' };
      expect(component.categorySlug).toBe('a-b-c-d');
    });

    it('should trim leading/trailing hyphens', () => {
      component.category = { ...mockCategory, name: '--test--' };
      expect(component.categorySlug).toBe('test');
    });

    it('should return empty string for empty name', () => {
      component.category = { ...mockCategory, name: '' };
      expect(component.categorySlug).toBe('');
    });
  });

  describe('mouse events', () => {
    it('should show tooltip and set position on mouseEnter', () => {
      const event = new MouseEvent('mouseenter', { clientX: 100, clientY: 200 });
      component.onMouseEnter(event);
      expect(component.showTooltip).toBeTrue();
      expect(component.tooltipX).toBe(110);
      expect(component.tooltipY).toBe(210);
    });

    it('should update position on mouseMove', () => {
      component.showTooltip = true;
      const event = new MouseEvent('mousemove', { clientX: 150, clientY: 250 });
      component.onMouseMove(event);
      expect(component.tooltipX).toBe(160);
      expect(component.tooltipY).toBe(260);
    });

    it('should hide tooltip on mouseLeave', () => {
      component.showTooltip = true;
      component.onMouseLeave();
      expect(component.showTooltip).toBeFalse();
    });
  });

  describe('focus events', () => {
    it('should show tooltip on focus using getBoundingClientRect', () => {
      const el = document.createElement('div');
      spyOn(el, 'getBoundingClientRect').and.returnValue({
        left: 50, top: 100, width: 200, height: 30,
        right: 250, bottom: 130, x: 50, y: 100,
        toJSON: () => {},
      });
      const event = new FocusEvent('focus');
      Object.defineProperty(event, 'target', { value: el });
      component.onFocus(event);
      expect(component.showTooltip).toBeTrue();
      expect(component.tooltipX).toBe(150);
      expect(component.tooltipY).toBe(90);
    });

    it('should hide tooltip on blur', () => {
      component.showTooltip = true;
      component.onBlur();
      expect(component.showTooltip).toBeFalse();
    });

    it('should handle focus when target is null', () => {
      const event = new FocusEvent('focus');
      Object.defineProperty(event, 'target', { value: null });
      expect(() => component.onFocus(event)).not.toThrow();
      expect(component.showTooltip).toBeTrue();
    });
  });
});
