import { useState } from "react"
import { motion } from "framer-motion"
import { Copy, FileText, Check, Zap, Target, ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import ActionPlanExport from "./ActionPlanExport"

interface Recommendation {
  tool: string
  confidence: number
  steps: string[]
  reasoning: string
}

interface RecommendationPanelProps {
  recommendation: Recommendation
  task: string
}

export default function RecommendationPanel({ recommendation, task }: RecommendationPanelProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const text = `Task: ${task}\n\nRecommended Tool: ${recommendation.tool}\nConfidence: ${recommendation.confidence}%\n\nSteps:\n${recommendation.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}\n\nReasoning: ${recommendation.reasoning}`
    
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Recommendation
          </CardTitle>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            AI Generated
          </Badge>
        </div>
        <CardDescription>
          Based on your task analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Recommended Tool</span>
            <Badge className="text-sm px-3 py-1">
              {recommendation.tool}
            </Badge>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Confidence</span>
              <span className="font-medium text-foreground">{recommendation.confidence}%</span>
            </div>
            <Progress value={recommendation.confidence} className="h-2" />
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Step-by-Step Actions</span>
          </div>
          <div className="space-y-2">
            {recommendation.steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </div>
                <span className="text-sm text-foreground">{step}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground">Reasoning</span>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {recommendation.reasoning}
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <div className="flex gap-3 w-full">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </>
            )}
          </Button>
          <ActionPlanExport 
            recommendation={recommendation}
            task={task}
          />
        </div>
      </CardFooter>
    </Card>
  )
}