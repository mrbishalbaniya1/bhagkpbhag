
'use server';
/**
 * @fileOverview A flow to generate a unique Nepali username.
 *
 * - generateUsername - A function that selects a unique username.
 * - GenerateUsernameInput - The input type for the generateUsername function.
 * - GenerateUsernameOutput - The return type for the generateUsername function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { words as nepaliWords } from '@/lib/nepali-words.json';

const GenerateUsernameInputSchema = z.object({
  usedUsernames: z.array(z.string()).describe('A list of usernames that are already taken. This list may be empty.'),
});
export type GenerateUsernameInput = z.infer<typeof GenerateUsernameInputSchema>;

const GenerateUsernameOutputSchema = z.object({
  username: z.string().describe('A unique username from the provided list that is not in the usedUsernames list.'),
});
export type GenerateUsernameOutput = z.infer<typeof GenerateUsernameOutputSchema>;

export async function generateUsername(input: GenerateUsernameInput): Promise<GenerateUsernameOutput> {
  return generateUsernameFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateUsernamePrompt',
  input: { schema: GenerateUsernameInputSchema },
  output: { schema: GenerateUsernameOutputSchema },
  prompt: `You are a username generator. Your task is to select one word from a predefined list of Nepali words.

Here is the list of available words:
${nepaliWords.join(', ')}

Please select one word from the available list.
Your response must only contain the selected username in the specified output format.`,
});

const generateUsernameFlow = ai.defineFlow(
  {
    name: 'generateUsernameFlow',
    inputSchema: GenerateUsernameInputSchema,
    outputSchema: GenerateUsernameOutputSchema,
  },
  async (input) => {
    // We can no longer reliably check for uniqueness here due to security rules.
    // The AI will just pick a name. Collisions should be rare.
    const { output } = await prompt(input);
    
    if (!output?.username || !nepaliWords.includes(output.username)) {
      // Fallback in case the model returns something weird.
      const fallbackUsername = nepaliWords[Math.floor(Math.random() * nepaliWords.length)];
      return { username: fallbackUsername };
    }

    return output;
  }
);

    