import { DialogueTree, GenerationConfig } from "@/types/dialogue";

const TEMPLATES_KEY = "npc-dialogue-templates";
const CONFIG_KEY = "npc-dialogue-config";
const API_KEY = "npc-dialogue-api-key";

export interface SavedTemplate {
  id: string;
  name: string;
  tree: DialogueTree;
  savedAt: number;
}

export function saveTemplate(name: string, tree: DialogueTree): SavedTemplate {
  const templates = getTemplates();
  const newTemplate: SavedTemplate = {
    id: `template-${Date.now()}`,
    name,
    tree,
    savedAt: Date.now(),
  };
  
  templates.push(newTemplate);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  return newTemplate;
}

export function getTemplates(): SavedTemplate[] {
  try {
    const stored = localStorage.getItem(TEMPLATES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function deleteTemplate(id: string): void {
  const templates = getTemplates().filter(t => t.id !== id);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

export function saveConfig(config: GenerationConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function getConfig(): GenerationConfig | null {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY, key);
}

export function getApiKey(): string {
  return localStorage.getItem(API_KEY) || "";
}