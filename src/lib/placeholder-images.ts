import data from './placeholder-images.json';

export type ImagePlaceholder = {
  id: string;
  description: string;
  imageUrl: string;
  imageHint: string;
};

export function getPlaceholderImages(): ImagePlaceholder[] {
    return data.placeholderImages;
}
