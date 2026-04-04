import { useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  FileAudio,
  Clock,
  Calendar,
  Tag,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SummaryCard } from "@/components/SummaryCard";
import type { Summary } from "@/pages/HomePage";

interface RecentSummariesProps {
  summaries: Summary[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function RecentSummaries({
  summaries,
  searchQuery,
  onSearchChange,
}: RecentSummariesProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const allTags = Array.from(new Set(summaries.flatMap((s) => s.tags)));

  const filteredSummaries = summaries.filter((s) => {
    const matchesSearch =
      !searchQuery ||
      s.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTag = !activeTag || s.tags.includes(activeTag);
    return matchesSearch && matchesTag;
  });

  const selectedSummary = summaries.find((s) => s.id === selectedId);

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search summaries..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tag Filters */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant={activeTag === null ? "default" : "outline"}
          className="cursor-pointer transition-all hover:scale-105"
          onClick={() => setActiveTag(null)}
        >
          All
        </Badge>
        {allTags.map((tag) => (
          <Badge
            key={tag}
            variant={activeTag === tag ? "default" : "outline"}
            className="cursor-pointer transition-all hover:scale-105"
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
          >
            {tag}
          </Badge>
        ))}
      </div>

      {/* Selected Summary Detail */}
      {selectedSummary && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <SummaryCard summary={selectedSummary} />
          <Button
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => setSelectedId(null)}
          >
            Close Detail
          </Button>
        </motion.div>
      )}

      {/* Summary Grid */}
      {filteredSummaries.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSummaries.map((summary, i) => (
            <motion.div
              key={summary.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card
                className={`group cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 ${
                  selectedId === summary.id
                    ? "border-primary/50 shadow-md"
                    : ""
                }`}
                onClick={() =>
                  setSelectedId(selectedId === summary.id ? null : summary.id)
                }
              >
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0 group-hover:from-primary/20 group-hover:to-primary/10 transition-colors">
                      <FileAudio className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {summary.fileName}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {summary.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {summary.duration}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
                  </div>

                  {/* Preview */}
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {summary.summary}
                  </p>

                  {/* Tags */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Tag className="w-3 h-3 text-muted-foreground" />
                    {summary.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 rounded"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground border-t border-border/50">
                    <span>{summary.keyPoints.length} key points</span>
                    <span>•</span>
                    <span>{summary.actionItems.length} actions</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="font-medium mb-1">No summaries found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {searchQuery || activeTag
                ? "Try adjusting your search or filter criteria"
                : "Upload your first meeting audio to get started"}
            </p>
            {(searchQuery || activeTag) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  onSearchChange("");
                  setActiveTag(null);
                }}
              >
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}