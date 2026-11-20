import { Component, computed, input } from '@angular/core';

const TONE_COUNT = 6;

/** First letters of the first two words, e.g. "Acme Coffee Ltd" → "AC". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/** Stable colour bucket per name, so the same merchant or reviewer always gets the same tint. */
export function toneOf(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % TONE_COUNT;
}

/**
 * Decorative initials badge. Always sits next to the visible name, so it is hidden from
 * assistive technology rather than announced twice.
 */
@Component({
  selector: 'app-avatar',
  template: `{{ initials() }}`,
  host: {
    'aria-hidden': 'true',
    '[attr.data-tone]': 'tone()',
    '[attr.data-size]': 'size()',
  },
  styles: `
    :host {
      --avatar-size: 36px;
      display: inline-grid;
      place-items: center;
      flex: none;
      inline-size: var(--avatar-size);
      block-size: var(--avatar-size);
      border-radius: 50%;
      font: var(--mat-sys-label-large);
      font-weight: 600;
      letter-spacing: 0.02em;
      user-select: none;
    }
    :host([data-size='sm']) {
      --avatar-size: 28px;
      font: var(--mat-sys-label-small);
      font-weight: 600;
    }
    :host([data-size='lg']) {
      --avatar-size: 40px;
    }
    :host([data-tone='0']) {
      background: light-dark(#ede9fe, #3b2a66);
      color: light-dark(#5b21b6, #ddd6fe);
    }
    :host([data-tone='1']) {
      background: light-dark(#e0f2fe, #0c3a55);
      color: light-dark(#075985, #bae6fd);
    }
    :host([data-tone='2']) {
      background: light-dark(#dcfce7, #0f3b24);
      color: light-dark(#166534, #bbf7d0);
    }
    :host([data-tone='3']) {
      background: light-dark(#ffedd5, #4a2a0c);
      color: light-dark(#9a3412, #fed7aa);
    }
    :host([data-tone='4']) {
      background: light-dark(#fce7f3, #4c1a35);
      color: light-dark(#9d174d, #fbcfe8);
    }
    :host([data-tone='5']) {
      background: light-dark(#e0e7ff, #262f66);
      color: light-dark(#3730a3, #c7d2fe);
    }
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  protected readonly initials = computed(() => initialsOf(this.name()));
  protected readonly tone = computed(() => toneOf(this.name()));
}
