import { Link, useLocation } from "react-router-dom";
import { useApp } from "../App";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Workflow,
  Puzzle,
  BarChart3,
  Settings,
  Zap,
  Globe,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { path: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { path: "/builder", icon: Workflow, labelKey: "nav.builder" },
  { path: "/connectors", icon: Puzzle, labelKey: "nav.connectors" },
  { path: "/analytics", icon: BarChart3, labelKey: "nav.analytics" },
  { path: "/settings", icon: Settings, labelKey: "nav.settings" },
];

export default function Sidebar() {
  const { t, language, setLanguage, user, automations } = useApp();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const activeCount = automations.filter((a) => a.status === "active").length;
  const totalHours = automations.reduce((sum, a) => sum + a.hoursSaved, 0);

  return (
    <aside
      className={`flex flex-col border-r border-border bg-card transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-lg font-bold text-foreground">AutoMate</span>
            <span className="text-xs text-muted-foreground">{t("common.automateYourStore")}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path === "/builder" && location.pathname.startsWith("/builder"));
          return (
            <Link key={item.path} to={item.path}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={`w-full justify-start gap-3 ${collapsed ? "px-2" : "px-3"}`}
              >
                <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                {!collapsed && <span>{t(item.labelKey)}</span>}
              </Button>
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* Stats */}
      {!collapsed && (
        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("dashboard.hoursSaved")}</span>
              <Badge variant="outline" className="text-xs">
                {totalHours}h
              </Badge>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{totalHours}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("dashboard.activeAutomations")}</span>
              <Badge className="bg-accent text-xs text-accent-foreground">{activeCount}</Badge>
            </div>
          </div>
        </div>
      )}

      {/* Language Toggle & User */}
      <div className="border-t border-border p-3">
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 w-full justify-start gap-2"
          onClick={() => setLanguage(language === "ru" ? "en" : "ru")}
        >
          <Globe className="h-4 w-4 text-muted-foreground" />
          {!collapsed && <span>{language === "ru" ? "🇷🇺 Русский" : "🇬🇧 English"}</span>}
        </Button>
        {!collapsed && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.plan === "pro" ? "Pro" : "Free"}</p>
            </div>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="mx-auto mb-2"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
    </aside>
  );
}