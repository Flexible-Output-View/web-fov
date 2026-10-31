import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export interface Category {
  name: string;
  viewers: string;
  image: string;
}

@Component({
  selector: 'app-category-card',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './category-card.component.html',
  styleUrls: ['./category-card.component.scss']
})
export class CategoryCardComponent {
  @Input() category!: Category;

  showTooltip = false;
  tooltipX = 0;
  tooltipY = 0;

  get categorySlug(): string {
    return this.category.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, ''); 
  }

  onMouseEnter(event: MouseEvent) {
    this.showTooltip = true;
    this.updateTooltipPosition(event);
  }

  onMouseMove(event: MouseEvent) {
    this.updateTooltipPosition(event);
  }

  onMouseLeave() {
    this.showTooltip = false;
  }

  onFocus(event: FocusEvent) {
    this.showTooltip = true;
    const el = event.target as HTMLElement;
    if (el) {
      const rect = el.getBoundingClientRect();
      this.tooltipX = rect.left + rect.width / 2;
      this.tooltipY = rect.top - 10;
    }
  }

  onBlur() {
    this.showTooltip = false;
  }

  private updateTooltipPosition(event: MouseEvent) {
    this.tooltipX = event.clientX + 10;
    this.tooltipY = event.clientY + 10;
  }
}
