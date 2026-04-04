import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Upload, FileAudio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
  progress: number;
}

export function FileUpload({ onFileSelect, isProcessing, progress }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const clearFile = () => {
    setSelectedFile(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-200 ${
        isDragging
          ? "border-primary border-2 bg-primary/5"
          : "border-dashed border-2 border-border hover:border-primary/50"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="p-8">
        {selectedFile && !isProcessing ? (
          /* Selected File State */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileAudio className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{selectedFile.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {formatFileSize(selectedFile.size)}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {selectedFile.type.split("/")[1]?.toUpperCase() || "AUDIO"}
                  </Badge>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={clearFile}>
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        ) : isProcessing ? (
          /* Processing State */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileAudio className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{selectedFile?.name}</p>
                <p className="text-sm text-muted-foreground">Processing...</p>
              </div>
            </div>
            <Progress value={progress} />
          </motion.div>
        ) : (
          /* Empty State */
          <label className="flex flex-col items-center gap-4 cursor-pointer">
            <motion.div
              animate={isDragging ? { scale: 1.1 } : { scale: 1 }}
              className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center"
            >
              <Upload className="h-8 w-8 text-primary" />
            </motion.div>
            <div className="text-center">
              <p className="font-medium text-foreground">
                {isDragging ? "Drop your file here" : "Drag & drop your meeting recording"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse • MP3, WAV, M4A, MP4 up to 500MB
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="h-4 w-4 mr-2" />
                Browse Files
              </span>
            </Button>
            <input
              type="file"
              className="hidden"
              accept="audio/*,video/*"
              onChange={handleFileInput}
            />
          </label>
        )}
      </div>

      {/* Drag Overlay */}
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-primary/10 flex items-center justify-center pointer-events-none"
        >
          <div className="text-center">
            <Upload className="h-12 w-12 text-primary mx-auto mb-2" />
            <p className="font-medium text-primary">Drop to upload</p>
          </div>
        </motion.div>
      )}
    </Card>
  );
}