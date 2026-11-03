import { useState } from 'react';
import type { MemoryPhoto } from '@/stores/memoryPhotosStore';
export function PhotoPreviewGrid({photos}: {photos: MemoryPhoto[]; onDelete: (id: string) => void; isDeleting: boolean}) {
 const [open, setOpen] = useState(false);
 return <><img alt={'Фото ' + photos[0].position} src={photos[0].enhancedUrl || photos[0].originalUrl} onClick={() => setOpen(true)} />{open && <div role='dialog'><button onClick={() => setOpen(false)}>Закрыть</button></div>}</>;
}
