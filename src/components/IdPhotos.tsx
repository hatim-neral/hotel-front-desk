import { useEffect, useRef, useState } from 'react';
import { getPhoto, newId } from '../storage';
import { compressImage } from '../utils';

// Shows ID photos as thumbnails. Pass onAdd/onRemove to make it editable.
// `pending` holds photos added in this session that are not saved to storage yet.
export default function IdPhotos({
  ids, pending = {}, onAdd, onRemove,
}: {
  ids: string[];
  pending?: Record<string, string>;
  onAdd?: (id: string, dataUrl: string) => void;
  onRemove?: (id: string) => void;
}) {
  const [stored, setStored] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ids
      .filter((id) => !pending[id] && !stored[id])
      .forEach(async (id) => {
        const url = await getPhoto(id);
        if (url) setStored((s) => ({ ...s, [id]: url }));
      });
  }, [ids, pending, stored]);

  const add = async (files: FileList | null) => {
    setError('');
    for (const file of Array.from(files ?? [])) {
      try {
        onAdd?.(newId(), await compressImage(file));
      } catch {
        setError(`Could not read ${file.name}. Please use a JPG or PNG photo.`);
      }
    }
    if (input.current) input.current.value = '';
  };

  const src = (id: string) => pending[id] ?? stored[id];

  return (
    <div className="photos">
      {ids.map((id) => (
        <div key={id} className="photo">
          {src(id) ? (
            <button type="button" className="photo-thumb" onClick={() => setOpen(id)} aria-label="View photo">
              <img src={src(id)} alt="ID proof" />
            </button>
          ) : (
            <div className="photo-thumb photo-missing">Loading…</div>
          )}
          {onRemove && (
            <button type="button" className="photo-remove no-print" onClick={() => onRemove(id)} aria-label="Remove photo">
              ✕
            </button>
          )}
        </div>
      ))}
      {onAdd && (
        <>
          <button type="button" className="photo-add" onClick={() => input.current?.click()}>
            <span className="photo-add-icon">📷</span>
            <span>{ids.length ? 'Add another photo' : 'Take / upload ID photo'}</span>
          </button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
        </>
      )}
      {!onAdd && !ids.length && <p className="muted">No ID photo uploaded.</p>}
      {error && <p className="field-error">{error}</p>}

      {open && (
        <div className="lightbox no-print" onClick={() => setOpen(null)} role="dialog">
          <img src={src(open)} alt="ID proof, full size" />
          <span className="lightbox-hint">Tap anywhere to close</span>
        </div>
      )}
    </div>
  );
}
