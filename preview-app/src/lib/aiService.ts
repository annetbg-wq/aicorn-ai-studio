import { GenerationConfig, DialogueTree, DialogueNode } from "@/types/dialogue";
import { getMockDialogue } from "./mockData";

const AI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

function buildPrompt(config: GenerationConfig): string {
  return `You are an expert NPC dialogue writer for video games. Generate a dialogue tree for the following character:

Character Name: ${config.characterName}
Character Description: ${config.characterDescription || "A typical NPC"}
Tone: ${config.tone}
Number of choices per node: ${config.choiceCount}
Scene Context: ${config.sceneContext || "A fantasy world"}

Generate a dialogue tree with 3-5 nodes. Each node should have:
- A speaker line (the NPC speaking)
- ${config.choiceCount} player response choices
- Each choice should lead to another node or end the conversation

Respond ONLY with valid JSON in this exact format:
{
  "nodes": [
    {
      "id": "node-1",
      "speaker": "${config.characterName}",
      "text": "The NPC's dialogue text",
      "choices": [
        { "id": "c1", "text": "Player choice text", "nextNodeId": "node-2" },
        { "id": "c2", "text": "Another choice", "nextNodeId": null }
      ]
    }
  ]
}

Make the dialogue engaging, with the ${config.tone} tone throughout. Each choice should feel meaningful.`;
}

function parseAIResponse(response: string, config: GenerationConfig): DialogueTree | null {
  try {
    // Extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!parsed.nodes || !Array.isArray(parsed.nodes)) return null;

    return {
      id: `ai-${Date.now()}`,
      characterName: config.characterName,
      tone: config.tone,
      createdAt: Date.now(),
      nodes: parsed.nodes.map((node: DialogueNode, index: number) => ({
        id: node.id || `node-${index + 1}`,
        speaker: node.speaker || config.characterName,
        text: node.text || "Hello, traveler.",
        choices: (node.choices || []).slice(0, config.choiceCount).map((choice, cIndex) => ({
          id: choice.id || `c${index}-${cIndex}`,
          text: choice.text || "Continue...",
          nextNodeId: choice.nextNodeId,
        })),
      })),
    };
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    return null;
  }
}

export async function generateDialogue(
  config: GenerationConfig,
  apiKey: string,
  useMock: boolean = false
): Promise<{ tree: DialogueTree; isAI: boolean }> {
  if (useMock || !apiKey) {
    return { tree: getMockDialogue(config), isAI: false };
  }

  try {
    const response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an expert NPC dialogue writer. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: buildPrompt(config),
          },
        ],
        temperature: 0.8,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content) {
      const tree = parseAIResponse(content, config);
      if (tree) {
        return { tree, isAI: true };
      }
    }

    // Fallback to mock if parsing fails
    return { tree: getMockDialogue(config), isAI: false };
  } catch (error) {
    console.error("AI generation failed:", error);
    return { tree: getMockDialogue(config), isAI: false };
  }
}

export function exportToJSON(tree: DialogueTree): string {
  return JSON.stringify(tree, null, 2);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}