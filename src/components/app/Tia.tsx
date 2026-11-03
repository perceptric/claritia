// Tia, Claritia's mascot (src/lib/studio/tia.ts): the face of the form designer in Form Studio.

import { TIA_STYLE, tiaSvg } from "@/lib/studio/tia";

export function Tia({ size = 20, working = false }: { size?: number; working?: boolean }) {
  return (
    <>
      <style>{TIA_STYLE}</style>
      <span className="inline-flex shrink-0" dangerouslySetInnerHTML={{ __html: tiaSvg(size, working) }} />
    </>
  );
}
