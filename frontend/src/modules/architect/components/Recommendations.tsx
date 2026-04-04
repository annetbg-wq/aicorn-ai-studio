import React, { useState, useEffect } from 'react';

interface RecommendationsProps {
  projectId: string;
}

export const Recommendations: React.FC<RecommendationsProps> = ({ projectId }) => {
  const [recommendations, setRecommendations] = useState<string[] | null>(null);

  useEffect(() => {
    // In a real application, fetch recommendations from an API here
    // Example:
    // fetch('/api/recommendations/' + projectId)
    //   .then(response => response.json())
    //   .then(data => setRecommendations(data));

    // Mock recommendations for MVP
    setRecommendations([
      'ROI-driven recommendation 1 for project ' + projectId + ' from AI model.',
      'ROI-driven recommendation 2 for project ' + projectId + ' from AI model.',
    ]);
  }, [projectId]);

  if (!recommendations) {
    return <div>Loading recommendations...</div>;
  }

  return (
    <div>
      <h2>Recommendations</h2>
      <ul>
        {recommendations.map((recommendation, index) => (
          <li key={index}>{recommendation}</li>
        ))}
      </ul>
    </div>
  );
};
