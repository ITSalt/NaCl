import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { PhotoPreviewGrid } from '@/components/features/memories/PhotoPreviewGrid';

type Photo = ComponentProps<typeof PhotoPreviewGrid>['photos'][number];
it('opens a completed photo and closes the viewer with its close button', async () => {
  const user = userEvent.setup();
  const photo = { id: 'photo-1', sessionId: 'session-1', position: 1,
    originalUrl: '/fixtures/original.jpg', enhancedUrl: '/fixtures/enhanced.jpg',
    processingStatus: 'enhanced', createdAt: '2026-01-01T00:00:00.000Z' } satisfies Photo;
  const onDelete = vi.fn();
  render(<PhotoPreviewGrid photos={[photo]} onDelete={onDelete} isDeleting={false} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('img', { name: 'Фото 1' }));
  const viewer = await screen.findByRole('dialog');
  expect(within(viewer).getByRole('img')).toHaveAttribute('src', '/fixtures/enhanced.jpg');
  await user.click(within(viewer).getByRole('button', { name: /закрыть/i }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Фото 1' })).toBeInTheDocument();
  expect(onDelete).not.toHaveBeenCalled();
});
