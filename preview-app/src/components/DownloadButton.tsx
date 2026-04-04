import { useCallback } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DownloadButtonProps {
  imageData: string;
  filename?: string;
}

export function DownloadButton({ imageData, filename = "upscaled.png" }: DownloadButtonProps) {
  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = imageData;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [imageData, filename]);

  return (
    <Button size="sm" onClick={handleDownload}>
      <Download className="w-4 h-4 mr-2" />
      Download
    </Button>
  );
}