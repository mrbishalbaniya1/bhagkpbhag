
'use server';
/**
 * @fileOverview A flow to generate audio commentary for the game.
 *
 * - generateCommentary - A function that takes a text phrase and returns audio.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';
import wav from 'wav';

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    const bufs: Buffer[] = [];
    writer.on('error', reject);
    writer.on('data', (d) => {
      bufs.push(d);
    });
    writer.on('end', () => {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}

const GenerateCommentaryInputSchema = z.object({
    phrase: z.string().describe('The phrase to convert to speech.'),
});
type GenerateCommentaryInput = z.infer<typeof GenerateCommentaryInputSchema>;

const GenerateCommentaryOutputSchema = z.object({
    audioDataUri: z.string().describe('The generated audio as a data URI.'),
});
type GenerateCommentaryOutput = z.infer<typeof GenerateCommentaryOutputSchema>;


export async function generateCommentary(input: GenerateCommentaryInput): Promise<GenerateCommentaryOutput> {
    return generateCommentaryFlow(input);
}


const generateCommentaryFlow = ai.defineFlow(
  {
    name: 'generateCommentaryFlow',
    inputSchema: GenerateCommentaryInputSchema,
    outputSchema: GenerateCommentaryOutputSchema,
  },
  async ({ phrase }) => {
    
    const { media } = await ai.generate({
      model: googleAI.model('gemini-2.5-flash-preview'),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Algenib' }, // A male voice
          },
        },
      },
      prompt: phrase,
    });

    if (!media?.url) {
      throw new Error('TTS model did not return any media.');
    }
    
    const audioBuffer = Buffer.from(
      media.url.substring(media.url.indexOf(',') + 1),
      'base64'
    );
    
    const wavBase64 = await toWav(audioBuffer);

    return {
      audioDataUri: 'data:audio/wav;base64,' + wavBase64,
    };
  }
);
