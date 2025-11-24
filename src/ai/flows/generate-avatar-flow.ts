
'use server';
/**
 * @fileOverview A flow to generate a stylized avatar from a user's image.
 *
 * - generateAvatar - A function that takes an image and a style and returns a new image.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

type GenerateAvatarInput = {
  imageDataUri: string;
  style: 'Pixel' | 'Anime' | 'Cartoon';
};

export async function generateAvatar(input: GenerateAvatarInput) {
  const GenerateAvatarInputSchema = z.object({
    imageDataUri: z.string().describe("The user's uploaded avatar as a data URI."),
    style: z.enum(['Pixel', 'Anime', 'Cartoon']).describe('The desired style for the new avatar.'),
  });
  
  // Validate input at runtime
  const parsedInput = GenerateAvatarInputSchema.parse(input);

  const { media } = await ai.generate({
    model: 'googleai/gemini-2.5-flash-image-preview',
    prompt: [
      { media: { url: parsedInput.imageDataUri } },
      { text: `Generate an image of this character in a ${parsedInput.style.toLowerCase()} art style` },
    ],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  if (!media?.url) {
    throw new Error('Failed to generate avatar. The model did not return an image.');
  }

  return { imageUrl: media.url };
}
