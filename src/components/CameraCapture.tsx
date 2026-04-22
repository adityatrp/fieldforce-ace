import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Check, X, SwitchCamera } from 'lucide-react';

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  title?: string;
}

/**
 * Live camera capture (no file picker = no gallery uploads possible).
 * Uses getUserMedia to stream the device camera and captures a single
 * still frame as a JPEG File. There is no fallback to file selection.
 */
const CameraCapture: React.FC<CameraCaptureProps> = ({ open, onClose, onCapture, title = 'Take Photo' }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [starting, setStarting] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = useCallback(async (mode: 'environment' | 'user') => {
    setError(null);
    setStarting(true);
    stopStream();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported on this device/browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      setError(e?.message || 'Unable to access camera. Please grant camera permission.');
    } finally {
      setStarting(false);
    }
  }, [stopStream]);

  useEffect(() => {
    if (open && !previewUrl) {
      startStream(facing);
    }
    if (!open) {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewBlob(null);
    }
    return () => {
      // cleanup on unmount
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      blob => {
        if (!blob) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        stopStream();
      },
      'image/jpeg',
      0.92,
    );
  };

  const handleConfirm = () => {
    if (!previewBlob) return;
    const file = new File([previewBlob], `capture-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    onCapture(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    onClose();
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    startStream(facing);
  };

  const handleSwitch = () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" /> {title}
          </DialogTitle>
        </DialogHeader>
        <div className="bg-black aspect-[3/4] w-full relative flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="text-center px-6 text-white space-y-2">
              <p className="text-sm">{error}</p>
              <Button size="sm" variant="secondary" onClick={() => startStream(facing)}>
                <RefreshCw className="h-4 w-4 mr-1" /> Retry
              </Button>
            </div>
          ) : previewUrl ? (
            <img src={previewUrl} alt="Captured preview" className="w-full h-full object-contain" />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-xs">
                  Starting camera…
                </div>
              )}
            </>
          )}
        </div>
        <div className="p-3 flex items-center justify-between gap-2 bg-background">
          {previewUrl ? (
            <>
              <Button variant="outline" className="flex-1 gap-1" onClick={handleRetake}>
                <RefreshCw className="h-4 w-4" /> Retake
              </Button>
              <Button className="flex-1 gap-1" onClick={handleConfirm}>
                <Check className="h-4 w-4" /> Use Photo
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="icon" onClick={onClose} title="Cancel">
                <X className="h-4 w-4" />
              </Button>
              <Button
                className="flex-1 h-12 gap-2"
                onClick={handleCapture}
                disabled={!!error || starting}
              >
                <Camera className="h-5 w-5" /> Capture
              </Button>
              <Button variant="outline" size="icon" onClick={handleSwitch} title="Switch camera">
                <SwitchCamera className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground text-center pb-3 px-4">
          Live camera only. Gallery uploads are not allowed.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default CameraCapture;
