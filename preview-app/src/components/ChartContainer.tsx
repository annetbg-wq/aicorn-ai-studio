import { motion } from "framer-motion"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

interface DataPoint {
  label: string
  value: number
}

interface ChartContainerProps {
  title: string
  description: string
  data: DataPoint[]
  type: "bar" | "line"
}

export default function ChartContainer({
  title,
  description,
  data,
  type,
}: ChartContainerProps) {
  const maxValue = Math.max(...data.map((d) => d.value))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 flex items-end justify-between gap-2">
          {data.map((point, index) => (
            <div
              key={point.label}
              className="flex-1 flex flex-col items-center gap-2"
            >
              <div className="w-full h-48 flex items-end justify-center">
                {type === "bar" ? (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(point.value / maxValue) * 100}%` }}
                    transition={{ duration: 0.8, delay: index * 0.1 }}
                    className="w-full max-w-12 bg-primary/80 hover:bg-primary rounded-t-md transition-colors cursor-pointer relative group"
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      ${point.value.toLocaleString()}
                    </div>
                  </motion.div>
                ) : (
                  <div className="w-full h-full relative flex items-end justify-center">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${(point.value / maxValue) * 100}%` }}
                      transition={{ duration: 0.8, delay: index * 0.1 }}
                      className="w-3 h-3 bg-primary rounded-full relative group cursor-pointer"
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {point.value.toLocaleString()}
                      </div>
                    </motion.div>
                    {index < data.length - 1 && (
                      <div
                        className="absolute bottom-0 left-0 right-0 border-t-2 border-primary/30"
                        style={{
                          height: `${(point.value / maxValue) * 100}%`,
                          transform: `translateY(-${(point.value / maxValue) * 100}%)`,
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{point.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}