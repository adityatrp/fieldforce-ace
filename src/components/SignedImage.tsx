import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SignedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Either a storage object path (preferred) or a legacy public URL. */
  path: string | null | undefined;
  bucket?: string;
  /** Signed URL expiry in seconds. Defaults to 5 minutes. */
  expiresIn?: number;
  fallback?: React.ReactNode;
  /** Called when the resolved URL is ready (e.g. for "open in new tab"). */
  onResolved?: (url: string) => void;
}

/**
 * Extract the storage object path from either a stored path or a legacy
 * Supabase public URL of the form `.../storage/v1/object/public/<bucket>/<path>`.
 */
export const extractStoragePath = (value: string, bucket: string): string | null => {
  if (!value) return null;
  // Already a path (no scheme)
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = value.indexOf(marker);
  if (idx >= 0) return value.substring(idx + marker.length);
  const signedMarker = `/storage/v1/object/sign/${bucket}/`;
  const sIdx = value.indexOf(signedMarker);
  if (sIdx >= 0) return value.substring(sIdx + signedMarker.length).split('?')[0];
  return null;
};

export const useSignedUrl = (
  path: string | null | undefined,
  bucket = 'photos',
  expiresIn = 300,
) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    const objectPath = extractStoragePath(path, bucket);
    if (!objectPath) {
      setError('Invalid path');
      return;
    }
    supabase.storage
      .from(bucket)
      .createSignedUrl(objectPath, expiresIn)
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e || !data) {
          setError(e?.message || 'Could not load image');
          setUrl(null);
        } else {
          setUrl(data.signedUrl);
          setError(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, bucket, expiresIn]);

  return { url, error };
};

const SignedImage: React.FC<SignedImageProps> = ({
  path,
  bucket = 'photos',
  expiresIn = 300,
  fallback = null,
  onResolved,
  ...imgProps
}) => {
  const { url, error } = useSignedUrl(path, bucket, expiresIn);

  useEffect(() => {
    if (url && onResolved) onResolved(url);
  }, [url, onResolved]);

  if (!path || error) return <>{fallback}</>;
  if (!url) {
    return (
      <div
        className={`bg-muted animate-pulse rounded-xl ${imgProps.className || ''}`}
        style={{ minHeight: 120 }}
      />
    );
  }
  return <img {...imgProps} src={url} />;
};

export default SignedImage;
