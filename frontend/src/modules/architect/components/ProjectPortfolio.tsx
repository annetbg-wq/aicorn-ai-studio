import React from 'react';

interface ProjectPortfolioProps {
  projects: { id: string; name: string; description: string }[];
  onProjectSelect: (projectId: string) => void;
}

export const ProjectPortfolio: React.FC<ProjectPortfolioProps> = ({ projects, onProjectSelect }) => {
  return (
    <div>
      <h2>Project Portfolio</h2>
      <ul>
        {projects.map((project) => (
          <li key={project.id}>
            <button onClick={() => onProjectSelect(project.id)}>
              {project.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
