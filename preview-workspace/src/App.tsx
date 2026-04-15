{
  "artifact": {
    "entry": "src/App.tsx",
    "files": [
      {
        "path": "src/pages/Dashboard.tsx",
        "content": "import React from \"react\";\nimport { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from \"@/components/ui/card\";\nimport { Progress } from \"@/components/ui/progress\";\nimport { Badge } from \"@/components/ui/badge\";\nimport { Button } from \"@/components/ui/button\";\nimport { useToast } from \"@/hooks/use-toast\";\n\nconst Dashboard = () => {\n  const { toast } = useToast();\n\n  const handleAchievement = () => {\n    toast({\n      title: \"Поздравляем!\",\n      description: \"Вы завершили новый урок!\",\n      action: <Button variant=\"outline\" size=\"sm\">Посмотреть</Button>,\n    });\n  };\n\n  return (\n    <div className=\"p-