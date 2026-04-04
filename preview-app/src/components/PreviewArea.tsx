import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface PreviewAreaProps {
  originalImage: string | null;
  upscaledImage: string | null;
  scale: number;
  isProcessing: boolean;
}

export function PreviewArea({ originalImage, upscaledImage, scale, isProcessing }: PreviewAreaProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Original */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Original</span>
          {originalImage && (
            <Badge variant="outline" className="text-xs">
              Original
            </Badge>
          )}
        </div>
        <div className="relative aspect-square rounded-lg border border-border bg-muted/30 overflow-hidden flex items-center justify-center">
          {originalImage ? (
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              src={originalImage}
              alt="Original pixel art"
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          ) : (
            <div className="text-muted-foreground text-sm">No image</div>
          )}
        </div>
      </div>

      {/* Upscaled */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Upscaled</span>
          {upscaledImage && (
            <Badge variant="outline" className="text-xs">
              {scale}x
            </Badge>
          )}
        </div>
        <div className="relative aspect-square rounded-lg border border-border bg-muted/30 overflow-hidden flex items-center justify-center">
          {isProcessing ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Skeleton className="w-full h-full absolute inset-0" />
              <div className="relative z-10 flex flex-col items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                  className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
                />
                <span className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                  Processing...
                </span>
              </div>
            </div>
          ) : upscaledImage ? (
            <motion.img
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              src={upscaledImage}
              alt="Upscaled pixel art"
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          ) : (
            <div className="text-muted-foreground text-sm text-center px-4">
              <p>Upscaled image will appear here</p>
              <p className="text-xs mt-1">Upload an image and click Upscale</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}