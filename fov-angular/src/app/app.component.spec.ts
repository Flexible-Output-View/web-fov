import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { RouterModule } from '@angular/router';
import { Component, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

// Mocks des composants enfants
@Component({ selector: 'app-navbar', template: '', standalone: true })
class MockNavbarComponent {
  @Output() sidebarToggle = new EventEmitter<void>();
}

@Component({ selector: 'app-sidebar', template: '', standalone: true })
class MockSidebarComponent {
  @Input() isCollapsed = true;
}

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, RouterModule.forRoot([])],
    })
    .overrideComponent(AppComponent, {
      set: {
        imports: [CommonModule, RouterModule, MockNavbarComponent, MockSidebarComponent]
      }
    })
    .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should have correct title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toBe('FOV - Flexible Output View');
  });

  it('should toggle sidebar collapsed state', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.isSidebarCollapsed).toBeTrue();
    app.onSidebarToggle();
    expect(app.isSidebarCollapsed).toBeFalse();
    app.onSidebarToggle();
    expect(app.isSidebarCollapsed).toBeTrue();
  });
});
