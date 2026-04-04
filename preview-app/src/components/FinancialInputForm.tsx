import { Plus, Trash2, DollarSign, PiggyBank } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { ExpenseItem } from "@/pages/ForecastPage";

interface Props {
  income: number;
  setIncome: (v: number) => void;
  expenses: ExpenseItem[];
  setExpenses: (v: ExpenseItem[]) => void;
  savingsGoal: number;
  setSavingsGoal: (v: number) => void;
  categories: string[];
}

export default function FinancialInputForm({
  income,
  setIncome,
  expenses,
  setExpenses,
  savingsGoal,
  setSavingsGoal,
  categories,
}: Props) {
  const addExpense = () => {
    const usedCategories = expenses.map((e) => e.category);
    const available = categories.find((c) => !usedCategories.includes(c)) || categories[0];
    setExpenses([
      ...expenses,
      { id: Date.now().toString(), category: available, amount: 0 },
    ]);
  };

  const removeExpense = (id: string) => {
    setExpenses(expenses.filter((e) => e.id !== id));
  };

  const updateExpense = (id: string, field: "category" | "amount", value: string | number) => {
    setExpenses(
      expenses.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Financial Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="income">Monthly Income</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              $
            </span>
            <Input
              id="income"
              type="number"
              min={0}
              value={income}
              onChange={(e) => setIncome(Number(e.target.value) || 0)}
              className="pl-7"
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Monthly Expenses</Label>
            <span className="text-sm text-muted-foreground">
              Total: <span className="font-medium text-foreground">${totalExpenses.toLocaleString()}</span>
            </span>
          </div>

          <AnimatePresence initial={false}>
            {expenses.map((expense) => (
              <motion.div
                key={expense.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex gap-2"
              >
                <select
                  value={expense.category}
                  onChange={(e) => updateExpense(expense.id, "category", e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="relative w-28 shrink-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                    $
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={expense.amount}
                    onChange={(e) =>
                      updateExpense(expense.id, "amount", Number(e.target.value) || 0)
                    }
                    className="pl-7 text-sm"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeExpense(expense.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>

          {expenses.length < categories.length && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={addExpense}
            >
              <Plus className="h-3 w-3" />
              Add Expense Category
            </Button>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="savings-goal" className="flex items-center gap-2">
            <PiggyBank className="h-4 w-4" />
            Savings Goal
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              $
            </span>
            <Input
              id="savings-goal"
              type="number"
              min={0}
              value={savingsGoal}
              onChange={(e) => setSavingsGoal(Number(e.target.value) || 0)}
              className="pl-7"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}