// lucide-react.d.ts
declare module 'lucide-react' {
  import { SVGProps, FC } from 'react';

  // Define a generic Icon type
  export type Icon = FC<SVGProps<SVGSVGElement> & { size?: number | string; color?: string; strokeWidth?: number | string; }>;

  // Manually list all icons you use in your project
  // This avoids having to list all 700+ icons
  export const Loader2: Icon;
  export const Music: Icon;
  export const Music2: Icon;
  export const ShieldCheck: Icon;
  export const Trash2: Icon;
  export const Trophy: Icon;
  export const Volume2: Icon;
  export const VolumeX: Icon;

  // You can also create a type for all available icons if you need it
  // This is useful for props that accept any icon name
  export type LucideIconName =
    | 'Loader2'
    | 'Music'
    | 'Music2'
    | 'ShieldCheck'
    | 'Trash2'
    | 'Trophy'
    | 'Volume2'
    | 'VolumeX';

  // Add any other exports from the library you might need
  // For example, if you use a helper function:
  // export function createLucideIcon(iconName: LucideIconName, iconNode: any[]): Icon;
}
