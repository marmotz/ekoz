import { Toaster as Sonner, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps) {
  return <Sonner className="toaster group" position="top-right" richColors {...props} />;
}

export { toast } from 'sonner';
