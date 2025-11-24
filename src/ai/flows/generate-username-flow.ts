
'use server';
/**
 * @fileOverview A flow to generate a unique English username.
 *
 * - generateUsername - A function that suggests a unique username.
 * - GenerateUsernameInput - The input type for the generateUsername function.
 * - GenerateUsernameOutput - The return type for the generateUsername function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateUsernameInputSchema = z.object({
  usedUsernames: z.array(z.string()).describe('A list of usernames that are already taken. This list may be empty.'),
});
export type GenerateUsernameInput = z.infer<typeof GenerateUsernameInputSchema>;

const GenerateUsernameOutputSchema = z.object({
  username: z.string().describe('A unique and creative English username, like "BraveBadger" or "QuickFox". It should not be in the usedUsernames list.'),
});
export type GenerateUsernameOutput = z.infer<typeof GenerateUsernameOutputSchema>;

export async function generateUsername(input: GenerateUsernameInput): Promise<GenerateUsernameOutput> {
  return generateUsernameFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateUsernamePrompt',
  input: { schema: GenerateUsernameInputSchema },
  output: { schema: GenerateUsernameOutputSchema },
  prompt: `You are a username generator. Your task is to generate a unique, creative, and family-friendly English username. The username should ideally be two words combined, like "AdjectiveNoun" (e.g., "HappyDolphin", "LuckyLion").

Do not use any of the following usernames:
{{#if usedUsernames}}
{{#each usedUsernames}}
- {{{this}}}
{{/each}}
{{/if}}

Please generate one unique username.
Your response must only contain the selected username in the specified output format.`,
});

const generateUsernameFlow = ai.defineFlow(
  {
    name: 'generateUsernameFlow',
    inputSchema: GenerateUsernameInputSchema,
    outputSchema: GenerateUsernameOutputSchema,
  },
  async (input) => {
    // The AI will attempt to generate a unique name based on the prompt.
    // While collisions are possible, they should be infrequent with creative usernames.
    const { output } = await prompt(input);
    
    if (!output?.username) {
      // Fallback in case the model fails to generate a name.
      const adjectives = ["Brave", "Clever", "Swift", "Silent", "Wise"];
      const nouns = ["Jaguar", "Eagle", "Panda", "Fox", "Wolf"];
      const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
      const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
      const fallbackUsername = `${randomAdjective}${randomNoun}${Math.floor(Math.random() * 100)}`;
      return { username: fallbackUsername };
    }

    return output;
  }
);
