
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
  usedUsernames: z.array(z.string()).describe('A list of usernames that are already taken.'),
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
  prompt: `You are a username generator. Your task is to select a unique username from a predefined list of Nepali words.

Here is the list of available words:
${nepaliWords.join(', ')}

Here is the list of usernames that are already in use:
{{#each usedUsernames}}
- {{{this}}}
{{/each}}

Please select one word from the available list that is NOT in the used usernames list.
Your response must only contain the selected username in the specified output format.`,
});

const generateUsernameFlow = ai.defineFlow(
  {
    name: 'generateUsernameFlow',
    inputSchema: GenerateUsernameInputSchema,
    outputSchema: GenerateUsernameOutputSchema,
  },
  async (input) => {
    // For smaller lists, we can also do this in JS, but using AI is more fun.
    if (input.usedUsernames.length >= nepaliWords.length) {
      // Fallback if all words are used. Appends a random number.
      const baseUsername = nepaliWords[Math.floor(Math.random() * nepaliWords.length)];
      return { username: `${baseUsername}${Math.floor(Math.random() * 1000)}` };
    }

    const { output } = await prompt(input);
    return output!;
  }
);
