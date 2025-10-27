import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Category {
  name: string;
  viewers: string | number;
  image: string;
}

@Component({
  selector: 'app-category-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './category-card.component.html',
  styleUrls: ['./category-card.component.scss']
})
export class CategoryCardComponent {
  @Input() category!: Category;
}