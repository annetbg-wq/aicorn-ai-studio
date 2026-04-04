import React from 'react';
import { Plus, Layout, Trash2, Settings } from 'lucide-react';

// 1. Описываем, какие данные Sidebar теперь ПРИНИМАЕТ
interface SidebarProps {
  currentProjectId?: string | null; 
  onSettings: () => void;
  projects: any[]; // Список проектов
  onNewProject: () => void; // Функция для новой задачи
  onLoadProject: (project: any) => void; // Загрузка старой
  onDeleteProject: (id: string) => void; // Удаление
}

// 2. Добавляем эти пропсы в саму функцию
export const Sidebar: React.FC<SidebarProps> = ({ 
  onSettings, 
  projects, 
  onNewProject, 
  onLoadProject, 
  onDeleteProject 
}) => {
  return (
    <div className="w-64 h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col z-40">
      {/* Кнопка "Новый проект" */}
      <div className="p-4">
        <button
          onClick={onNewProject}
          className="w-full flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all font-medium shadow-lg shadow-blue-900/20"
        >
          <Plus size={18} />
          <span>New Project</span>
        </button>
      </div>

      {/* Список сохраненных проектов */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1">
        <div className="px-3 py-2 text-[10px] font-bold text-white/30 uppercase tracking-widest">
          Recent Projects
        </div>
        
        {projects.length === 0 && (
          <div className="px-3 py-4 text-xs text-white/20 italic text-center">
            No projects yet
          </div>
        )}

        {projects.map((project) => (
          <div 
            key={project.id}
            onClick={() => onLoadProject(project)}
            className="group flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-all border border-transparent hover:border-white/5"
          >
            <div className="w-8 h-8 rounded-md bg-white/5 flex items-center justify-center text-white/40 group-hover:text-blue-400 transition-colors">
              <Layout size={14} />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white/70 truncate font-medium">
                {project.title || "Untitled Project"}
              </div>
              <div className="text-[10px] text-white/20 truncate">
                {new Date(project.date).toLocaleDateString()}
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation(); // Чтобы не сработал клик по самому проекту
                onDeleteProject(project.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-md text-white/20 transition-all"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Кнопка настроек внизу */}
      <div className="p-4 border-t border-white/5">
        <button
          onClick={onSettings}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-all text-sm"
        >
          <Settings size={18} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
};