import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileAudio,
  FileVideo,
  X,
  Music,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
}

const ACCEPTED_FORMATS = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/m4a",
  "video/mp4",
  "video/webm",
];

const FORMAT_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".mp4", ".webm"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploadZone({ onFileSelect }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): boolean => {
    setError(null);
    const isValidType =
      ACCEPTED_FORMATS.includes(file.type) ||
      FORMAT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!isValidType) {
      setError("Unsupported format. Please upload an audio or video file.");
      return false;
    }
    if (file.size > 500 * 1024 * 1024) {
      setError("File too large. Maximum size is 500MB.");
      return false;
    }
    return true;
  };

  const handleFile = (file: File) => {
    if (validateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleProcess = () => {
    if (selectedFile) {
      onFileSelect(selectedFile);
      setSelectedFile(null);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setError(null);
  };

  const getFileIcon = (name: string) => {
    if (name.match(/\.(mp4|webm|mov)$/i)) return FileVideo;
    return FileAudio;
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative transition-all duration-300 ${
            isDragging
              ? "bg-primary/5 border-primary"
              : "hover:bg-muted/30"
          }`}
        >
          <input
            type="file"
            accept=".mp3,.wav,.ogg,.m4a,.mp4,.webm,audio/*,video/*"
            onChange={handleInputChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            id="file-upload"
          />

          <AnimatePresence mode="wait">
            {selectedFile ? (
              <motion.div
                key="selected"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-8"
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    {(() => {
                      const Icon = getFileIcon(selectedFile.name);
                      return <Icon className="w-8 h-8 text-primary" />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {selectedFile.name}
                      </p>
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatFileSize(selectedFile.size)} • Ready to process
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button onClick={handleProcess} className="gap-2">
                        <Sparkles className="w-4 h-4" />
                        Generate Summary
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault();
                          handleClear();
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-8 sm:p-12 text-center"
              >
                <motion.div
                  animate={
                    isDragging
                      ? { scale: 1.1, y: -5 }
                      : { scale: 1, y: 0 }
                  }
                  className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-6 border-2 border-dashed border-primary/20"
                >
                  <Upload
                    className={`w-8 h-8 transition-colors ${
                      isDragging ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                </motion.div>

                <h3 className="text-lg font-semibold mb-2">
                  {isDragging ? "Drop your file here" : "Upload Meeting Audio"}
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Drag and drop or click to browse
                </p>

                <div className="flex flex-wrap justify-center gap-2 mb-2">
                  {FORMAT_EXTENSIONS.map((ext) => (
                    <Badge
                      key={ext}
                      variant="secondary"
                      className="text-xs font-mono"
                    >
                      {ext}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Maximum file size: 500MB
                </p>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-destructive mt-4 flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    {error}
                  </motion.p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}

function Sparkles({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}