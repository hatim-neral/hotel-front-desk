import { useEffect, useRef, useState } from 'react';
import { getPhoto, newId } from '../storage';
import { compressImage } from '../utils';

const MAX_SIZE = 800; // px; a face photo doesn't need more

function usePhoto(id: string, pending: Record<string, string> = {}): string | undefined {
  const [stored, setStored] = useState<{ id: string; url?: string }>({ id: '' });
  useEffect(() => {
    if (!id || pending[id]) return;
    let current = true;
    getPhoto(id).then((url) => current && setStored({ id, url }));
    return () => {
      current = false;
    };
  }, [id, pending]);
  return pending[id] ?? (stored.id === id ? stored.url : undefined);
}

// The guest's photo on the guest page and the printed registration card
export function GuestPhotoView({ id }: { id: string }) {
  const url = usePhoto(id);
  const [open, setOpen] = useState(false);
  if (!id || !url) return null;
  return (
    <>
      <button type="button" className="guest-photo" onClick={() => setOpen(true)} aria-label="View guest photo">
        <img src={url} alt="Guest" />
      </button>
      {open && (
        <div className="lightbox no-print" onClick={() => setOpen(false)} role="dialog">
          <img src={url} alt="Guest, full size" />
          <span className="lightbox-hint">Tap anywhere to close</span>
        </div>
      )}
    </>
  );
}

// Take the guest's photo with the camera (webcam on a desk PC, front camera on a phone) or upload one.
// `pending` holds photos taken on this screen that are not saved yet.
export function GuestPhotoField({
  id, pending, onChange,
}: {
  id: string;
  pending: Record<string, string>;
  onChange: (id: string, dataUrl?: string) => void; // '' removes the photo
}) {
  const url = usePhoto(id, pending);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const canUseCamera = !!navigator.mediaDevices?.getUserMedia;

  const fromFile = async (file?: File) => {
    setError('');
    if (!file) return;
    try {
      onChange(newId(), await compressImage(file, MAX_SIZE));
    } catch {
      setError('Could not read this photo. Please use a JPG or PNG.');
    }
    if (upload.current) upload.current.value = '';
  };

  return (
    <div className="guest-photo-field">
      <div className="guest-photo guest-photo-lg">
        {id && url ? <img src={url} alt="Guest" /> : <span className="muted small">No photo</span>}
      </div>
      <div className="guest-photo-actions">
        {canUseCamera && (
          <button type="button" className="btn btn-primary" onClick={() => setCamera(true)}>
            📷 {id ? 'Retake photo' : 'Take photo'}
          </button>
        )}
        <button type="button" className="btn" onClick={() => upload.current?.click()}>
          {canUseCamera ? 'Upload' : id ? 'Retake / upload photo' : 'Take / upload photo'}
        </button>
        {id && <button type="button" className="btn btn-ghost danger-text" onClick={() => onChange('')}>Remove</button>}
        <input ref={upload} type="file" accept="image/*" capture="user" hidden onChange={(e) => fromFile(e.target.files?.[0])} />
        {error && <p className="field-error">{error}</p>}
      </div>
      {camera && (
        <CameraModal
          onClose={() => setCamera(false)}
          onCapture={(dataUrl) => {
            setCamera(false);
            onChange(newId(), dataUrl);
          }}
          onFail={(msg) => {
            setCamera(false);
            setError(msg);
          }}
        />
      )}
    </div>
  );
}

function CameraModal({
  onCapture, onClose, onFail,
}: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  onFail: (msg: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [ready, setReady] = useState(false);
  const fail = useRef(onFail);
  fail.current = onFail;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().then(() => setReady(true), () => setReady(true));
        }
      })
      .catch(() => !cancelled && fail.current('Camera not available — allow camera access in the browser, or use Upload.'));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_SIZE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    // the preview is mirrored for the selfie camera; the saved photo is not
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/jpeg', 0.8));
  };

  return (
    <div className="camera no-print" role="dialog" aria-label="Take guest photo">
      <video ref={video} playsInline muted className={facing === 'user' ? 'mirror' : ''} />
      {!ready && <p className="camera-wait">Starting camera…</p>}
      <div className="camera-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary btn-xl" onClick={snap} disabled={!ready}>Capture</button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setReady(false);
            setFacing(facing === 'user' ? 'environment' : 'user');
          }}
        >
          Switch camera
        </button>
      </div>
    </div>
  );
}
