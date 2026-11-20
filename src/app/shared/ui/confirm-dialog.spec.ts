import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';

/** Minimal host: the dialog is opened through the real MatDialog, as the app does. */
@Component({ template: '' })
class Host {
  readonly dialog = inject(MatDialog);
}

describe('ConfirmDialog', () => {
  const data: ConfirmDialogData = {
    title: 'Discard this draft?',
    message: 'This cannot be undone.',
    confirmLabel: 'Discard draft',
    destructive: true,
  };

  async function open() {
    TestBed.configureTestingModule({
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    const fixture = TestBed.createComponent(Host);
    const ref = fixture.componentInstance.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(
      ConfirmDialog,
      { data },
    );
    const result = firstValueFrom(ref.afterClosed());
    // Dialogs render in the overlay container, outside the fixture.
    const loader: HarnessLoader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const dialog = await loader.getHarness(MatDialogHarness);
    return { dialog, result };
  }

  it('shows the title, message and confirm label', async () => {
    const { dialog } = await open();
    expect(await dialog.getTitleText()).toBe('Discard this draft?');
    expect(await dialog.getContentText()).toBe('This cannot be undone.');
    const buttons = await dialog.getAllHarnesses(MatButtonHarness);
    expect(await Promise.all(buttons.map((button) => button.getText()))).toEqual([
      'Cancel',
      'Discard draft',
    ]);
  });

  it('closes with true when confirmed', async () => {
    const { dialog, result } = await open();
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Discard draft' }))).click();
    expect(await result).toBe(true);
  });

  it('closes with false when cancelled', async () => {
    const { dialog, result } = await open();
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Cancel' }))).click();
    expect(await result).toBe(false);
  });
});
