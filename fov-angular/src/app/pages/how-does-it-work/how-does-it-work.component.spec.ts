import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HowDoesItWorkComponent } from './how-does-it-work.component';

describe('HowDoesItWorkComponent', () => {
  let component: HowDoesItWorkComponent;
  let fixture: ComponentFixture<HowDoesItWorkComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HowDoesItWorkComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HowDoesItWorkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
