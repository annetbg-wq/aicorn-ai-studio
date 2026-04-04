import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, ChevronRight, ChevronDown, MessageSquare, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogueTree, DialogueNode } from "@/types/dialogue";

interface DialoguePreviewProps {
  tree: DialogueTree | null;
  isAI: boolean;
}

function NodeCard({ node, tree, depth = 0 }: { node: DialogueNode; tree: DialogueTree; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);

  const findNode = (id: string | null) => tree.nodes.find(n => n.id === id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: depth * 0.1 }}
      className={`${depth > 0 ? "ml-6 border-l-2 border-border pl-4" : ""}`}
    >
      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs">
                  {node.speaker}
                </Badge>
                <span className="text-xs text-muted-foreground">Node {node.id}</span>
              </div>
              <p className="text-sm text-foreground">{node.text}</p>
            </div>
            {node.choices.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          <AnimatePresence>
            {expanded && node.choices.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-4 space-y-2 overflow-hidden"
              >
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Player Choices:
                </p>
                {node.choices.map((choice) => (
                  <div key={choice.id} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <ArrowRight className="h-3 w-3 text-accent-foreground" />
                      <span className="text-accent-foreground">{choice.text}</span>
                      {choice.nextNodeId ? (
                        <Badge variant="secondary" className="text-xs">
                          → {choice.nextNodeId}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          End
                        </Badge>
                      )}
                    </div>
                    {choice.nextNodeId && findNode(choice.nextNodeId) && (
                      <NodeCard
                        node={findNode(choice.nextNodeId)!}
                        tree={tree}
                        depth={depth + 1}
                      />
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function DialoguePreview({ tree, isAI }: DialoguePreviewProps) {
  if (!tree) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Dialogue Preview
          </CardTitle>
          <CardDescription>
            Generate a dialogue to see the tree structure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No dialogue generated yet</p>
            <p className="text-sm text-muted-foreground">
              Configure your character and click generate
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const startNode = tree.nodes[0];

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              {tree.characterName}
            </CardTitle>
            <CardDescription>
              Dialogue tree with {tree.nodes.length} nodes
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isAI ? "default" : "secondary"}>
              {isAI ? "AI Generated" : "Mock Data"}
            </Badge>
            <Badge variant="outline">{tree.tone}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {startNode && <NodeCard node={startNode} tree={tree} />}
        </div>
      </CardContent>
    </Card>
  );
}