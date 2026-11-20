import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Notifier } from './notifier';

describe('Notifier', () => {
  it('lazily loads the snack bar and shows the message', async () => {
    const open = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: MatSnackBar, useValue: { open } }] });
    TestBed.inject(Notifier).notify('Hello', 1000);
    await vi.waitFor(() =>
      expect(open).toHaveBeenCalledWith('Hello', 'Dismiss', { duration: 1000 }),
    );
  });
});
