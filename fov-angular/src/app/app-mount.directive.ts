import { Directive, ElementRef, Input, OnInit } from '@angular/core';

@Directive({
  selector: '[appMount]',
  standalone: true,
})
export class AppMountDirective implements OnInit {
  @Input('appMount') elementToMount?: HTMLElement;

  constructor(private hostRef: ElementRef<HTMLElement>) {}

  ngOnInit() {
    if (this.elementToMount) {
      this.elementToMount.style.width = '100%';
      this.elementToMount.style.height = '100%';
      this.elementToMount.style.objectFit = 'contain';
      this.hostRef.nativeElement.appendChild(this.elementToMount);
    }
  }
}
