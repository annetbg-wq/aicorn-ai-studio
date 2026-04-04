import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Baby, Ruler, Weight, Sparkles } from "lucide-react";
import { WeekData, getTrimester } from "@/data/pregnancyData";

interface WeekCardProps {
  data: WeekData;
  userName: string;
}

export default function WeekCard({ data, userName }: WeekCardProps) {
  const trimester = getTrimester(data.week);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="overflow-hidden border-2 border-border">
        <div className="bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 p-1" />
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardDescription className="text-sm">Hello, {userName}! 👋</CardDescription>
              <CardTitle className="text-3xl font-bold mt-1">
                Week {data.week}
              </CardTitle>
            </div>
            <Badge variant="outline" className={`${trimester.color} border-current`}>
              {trimester.name}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <motion.div
            className="flex items-center gap-4 p-4 rounded-lg bg-muted/50"
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="text-5xl">{data.sizeEmoji}</div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Your baby is the size of</p>
              <p className="text-2xl font-bold text-foreground">{data.babySize}</p>
            </div>
            <Baby className="h-8 w-8 text-pink-500" />
          </motion.div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
              <Ruler className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-xs text-muted-foreground">Length</p>
                <p className="font-semibold">{data.lengthCm} cm</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
              <Weight className="h-5 w-5 text-indigo-500" />
              <div>
                <p className="text-xs text-muted-foreground">Weight</p>
                <p className="font-semibold">{data.weightG} g</p>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold">Development Milestones</h3>
            </div>
            <ul className="space-y-2">
              {data.milestones.map((milestone, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="mt-1 h-2 w-2 rounded-full bg-pink-500 shrink-0" />
                  <span className="text-muted-foreground">{milestone}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-r from-pink-500/5 to-purple-500/5 border border-pink-500/20">
            <p className="text-xs font-medium text-pink-500 mb-1">💡 Tip for this week</p>
            <p className="text-sm text-foreground">{data.momTip}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}