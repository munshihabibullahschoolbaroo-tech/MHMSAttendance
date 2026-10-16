"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Loader2, FileText, AlertCircle } from "lucide-react";

export interface MediaPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  title?: string;
}

/**
 * Checks whether a URL (or data URI) points to an image.
 */
function isImageUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  const cleanUrl = url.split("?")[0].toLowerCase();
  return (
    cleanUrl.endsWith(".jpg") ||
    cleanUrl.endsWith(".jpeg") ||
    cleanUrl.endsWith(".png") ||
    cleanUrl.endsWith(".webp") ||
    cleanUrl.endsWith(".gif") ||
    cleanUrl.endsWith(".svg") ||
    cleanUrl.endsWith(".bmp")
  );
}

export function MediaPreviewModal({
  isOpen,
  onClose,
  url,
  title,
}: MediaPreviewModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [imageLoading, setImageLoading] = React.useState(true);
  const [imageError, setImageError] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Reset loading state when url changes or modal opens
  React.useEffect(() => {
    if (isOpen) {
      setImageLoading(true);
      setImageError(false);
    }
  }, [isOpen, url]);

  // Handle ESC key to close
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when preview is active
  React.useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!mounted || !url) return null;

  const isImg = isImageUrl(url);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title || "Preview"}
          className="fixed inset-0 z-[100600] flex flex-col items-center justify-center p-3 sm:p-6 select-none"
        >
          {/* Dark blurred backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/85 backdrop-blur-md cursor-pointer"
          />

          {/* Top action header */}
          <div className="relative z-20 w-full max-w-4xl flex items-center justify-between gap-3 mb-2 px-1 text-white">
            <div className="flex items-center gap-2 min-w-0 pr-3">
              <FileText className="size-4 shrink-0 text-blue-400" />
              <span className="text-xs sm:text-sm font-semibold truncate text-zinc-100">
                {title || "Document Preview"}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Optional open in new tab for download/print if user wants it */}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-medium text-zinc-200 hover:text-white transition-colors cursor-pointer border border-white/15"
                title="Open raw file / download"
              >
                <ExternalLink className="size-3.5" />
                <span>Open Raw</span>
              </a>

              {/* Close Button in Top Right Corner */}
              <button
                type="button"
                onClick={onClose}
                className="flex size-9 sm:size-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 active:scale-95 transition-all cursor-pointer border border-white/25 shadow-lg backdrop-blur-xs"
                title="Close Preview (Esc)"
                aria-label="Close Preview"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          {/* Content Card Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="relative z-10 max-h-[82vh] max-w-[96vw] sm:max-w-4xl flex items-center justify-center overflow-hidden rounded-2xl bg-zinc-950/70 border border-white/10 shadow-2xl p-1.5 sm:p-2"
            onClick={(e) => e.stopPropagation()}
          >
            {isImg ? (
              <div className="relative flex items-center justify-center max-h-[80vh] min-h-[160px] min-w-[200px]">
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/40">
                    <Loader2 className="size-8 animate-spin text-blue-400" />
                  </div>
                )}
                {imageError ? (
                  <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-zinc-400">
                    <AlertCircle className="size-8 text-red-400" />
                    <p className="text-xs">Failed to load image preview.</p>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 mt-1"
                    >
                      <span>Try opening directly</span>
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={title || "Preview"}
                    onLoad={() => setImageLoading(false)}
                    onError={() => {
                      setImageLoading(false);
                      setImageError(true);
                    }}
                    className="max-h-[78vh] max-w-[94vw] sm:max-w-3xl object-contain rounded-xl select-none"
                  />
                )}
              </div>
            ) : (
              <div className="w-[94vw] sm:w-[80vw] max-w-4xl h-[75vh] flex flex-col bg-white rounded-xl overflow-hidden">
                <iframe
                  src={url}
                  title={title || "Document Preview"}
                  className="w-full h-full border-0"
                />
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
