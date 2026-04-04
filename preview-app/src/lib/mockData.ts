import { DialogueTree, GenerationConfig } from "@/types/dialogue";

const mockDialogues: Record<string, DialogueTree> = {
  "friendly-merchant": {
    id: "mock-1",
    characterName: "Friendly Merchant",
    tone: "friendly",
    createdAt: Date.now(),
    nodes: [
      {
        id: "node-1",
        speaker: "Friendly Merchant",
        text: "Welcome, traveler! You look like you've had a long journey. What brings you to my humble shop today?",
        choices: [
          { id: "c1", text: "I'm looking for supplies for my adventure.", nextNodeId: "node-2" },
          { id: "c2", text: "Just browsing. What do you have?", nextNodeId: "node-3" },
          { id: "c3", text: "I heard you might have something... special?", nextNodeId: "node-4" },
        ],
      },
      {
        id: "node-2",
        speaker: "Friendly Merchant",
        text: "Ah, an adventurer! I've got potions, rations, and sturdy gear. For someone with your determination, I'll give you a special discount!",
        choices: [
          { id: "c4", text: "Show me your best potions.", nextNodeId: null },
          { id: "c5", text: "What kind of gear do you recommend?", nextNodeId: null },
        ],
      },
      {
        id: "node-3",
        speaker: "Friendly Merchant",
        text: "Of course! Take your time. I've got goods from all across the realm. If something catches your eye, just let me know!",
        choices: [
          { id: "c6", text: "Tell me about this strange artifact.", nextNodeId: null },
          { id: "c7", text: "Do you buy items as well?", nextNodeId: null },
        ],
      },
      {
        id: "node-4",
        speaker: "Friendly Merchant",
        text: "*leans in and whispers* Ah, you have a keen eye. I do have a few... unique items in the back. But such things come at a price, friend.",
        choices: [
          { id: "c8", text: "I can pay. Show me what you have.", nextNodeId: null },
          { id: "c9", text: "Perhaps we could work out a trade?", nextNodeId: null },
        ],
      },
    ],
  },
  "mysterious-guard": {
    id: "mock-2",
    characterName: "Mysterious Guard",
    tone: "mysterious",
    createdAt: Date.now(),
    nodes: [
      {
        id: "node-1",
        speaker: "Mysterious Guard",
        text: "You approach the ancient door... The guard's eyes gleam beneath the shadow of their hood. 'Many have sought passage. Few have proven worthy.'",
        choices: [
          { id: "c1", text: "What must I do to prove my worth?", nextNodeId: "node-2" },
          { id: "c2", text: "I don't need your permission.", nextNodeId: "node-3" },
          { id: "c3", text: "Who are you guarding this place from?", nextNodeId: "node-4" },
        ],
      },
      {
        id: "node-2",
        speaker: "Mysterious Guard",
        text: "'Worth is not proven through strength alone. Answer me this: What is the sound of one hand clapping?' The guard's lips curl into an enigmatic smile.",
        choices: [
          { id: "c4", text: "Silence. The answer is silence.", nextNodeId: null },
          { id: "c5", text: "A trick question. There is no sound.", nextNodeId: null },
        ],
      },
      {
        id: "node-3",
        speaker: "Mysterious Guard",
        text: "'Bold words. But boldness without wisdom is merely recklessness.' The guard steps aside, revealing nothing but a solid wall behind them.",
        choices: [
          { id: "c6", text: "This is a test. Where is the real door?", nextNodeId: null },
          { id: "c7", text: "I see through your illusions.", nextNodeId: null },
        ],
      },
      {
        id: "node-4",
        speaker: "Mysterious Guard",
        text: "'From those who would unravel what should remain woven. From those who seek answers to questions they do not yet understand.'",
        choices: [
          { id: "c8", text: "I understand more than you think.", nextNodeId: null },
          { id: "c9", text: "Then teach me to understand.", nextNodeId: null },
        ],
      },
    ],
  },
  "hostile-bandit": {
    id: "mock-3",
    characterName: "Hostile Bandit",
    tone: "hostile",
    createdAt: Date.now(),
    nodes: [
      {
        id: "node-1",
        speaker: "Hostile Bandit",
        text: "Well, well, well... Look what we have here! Another fool wandering into our territory. Hand over your valuables, and maybe we'll let you keep your boots!",
        choices: [
          { id: "c1", text: "You'll have to take them from me!", nextNodeId: "node-2" },
          { id: "c2", text: "Perhaps we can make a deal.", nextNodeId: "node-3" },
          { id: "c3", text: "I don't have anything of value.", nextNodeId: "node-4" },
        ],
      },
      {
        id: "node-2",
        speaker: "Hostile Bandit",
        text: "Ha! I like your spirit, fool! Boys, we've got a live one! Let's see how brave you are when steel meets flesh!",
        choices: [
          { id: "c4", text: "Draw your weapon and fight!", nextNodeId: null },
          { id: "c5", text: "Wait! I challenge your leader to single combat!", nextNodeId: null },
        ],
      },
      {
        id: "node-3",
        speaker: "Hostile Bandit",
        text: "A deal? *spits on the ground* The only deal here is your life for your coin. But... I'm curious. What could you possibly offer?",
        choices: [
          { id: "c6", text: "Information about a rich caravan passing through.", nextNodeId: null },
          { id: "c7", text: "My services. I know these lands well.", nextNodeId: null },
        ],
      },
      {
        id: "node-4",
        speaker: "Hostile Bandit",
        text: "Nothing? *laughs cruelly* Then you're worthless to us! But wait... that armor looks decent. Strip it off, and you can crawl away!",
        choices: [
          { id: "c8", text: "Never! This armor was my father's!", nextNodeId: null },
          { id: "c9", text: "Fine, take it. Just let me go.", nextNodeId: null },
        ],
      },
    ],
  },
};

export function getMockDialogue(config: GenerationConfig): DialogueTree {
  const toneKey = config.tone.toLowerCase();
  
  // Find a matching mock dialogue
  const matchingKey = Object.keys(mockDialogues).find(key => key.includes(toneKey));
  
  if (matchingKey) {
    const mock = mockDialogues[matchingKey];
    return {
      ...mock,
      id: `generated-${Date.now()}`,
      characterName: config.characterName || mock.characterName,
      tone: config.tone,
      createdAt: Date.now(),
      nodes: mock.nodes.map(node => ({
        ...node,
        speaker: config.characterName || node.speaker,
        choices: node.choices.slice(0, config.choiceCount),
      })),
    };
  }

  // Fallback generic dialogue
  return {
    id: `generated-${Date.now()}`,
    characterName: config.characterName || "NPC",
    tone: config.tone,
    createdAt: Date.now(),
    nodes: [
      {
        id: "node-1",
        speaker: config.characterName || "NPC",
        text: `Greetings, traveler. I am ${config.characterName || "a mysterious figure"}. ${config.sceneContext ? `In this ${config.sceneContext}...` : ""} What business brings you to me?`,
        choices: Array.from({ length: config.choiceCount }, (_, i) => ({
          id: `c${i + 1}`,
          text: [
            "I seek your wisdom.",
            "I have questions about this place.",
            "I'm looking for adventure.",
            "Can you help me with something?",
            "Tell me about yourself.",
          ][i] || "Continue...",
          nextNodeId: i === 0 ? "node-2" : null,
        })),
      },
      {
        id: "node-2",
        speaker: config.characterName || "NPC",
        text: "Interesting... Your path is not yet clear to me. But perhaps together we can find what you seek.",
        choices: Array.from({ length: Math.min(config.choiceCount, 2) }, (_, i) => ({
          id: `c${i + 6}`,
          text: ["Thank you for your help.", "I'll be on my way now."][i],
          nextNodeId: null,
        })),
      },
    ],
  };
}