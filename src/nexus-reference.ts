import type { NexusLayout, NexusNode } from "./nexus";
export type AtlasPoint={x:number;y:number};

/**
 * Asymmetric, reference-oriented spatial composition.
 * Decorative markers occupy compact fan-shaped blocks inside a sparse double orbit.
 * Actual knowledge objects are positioned separately, never discarded.
 */
export function referenceAtlasPositions(layout:NexusLayout):Map<string,AtlasPoint>{
  const positions=new Map<string,AtlasPoint>();
  for(let sectorIndex=0;sectorIndex<layout.sectors.length;sectorIndex++){
    const sector=layout.sectors[sectorIndex];
    const nodes=layout.nodes.filter(node=>node.sector===sectorIndex&&!node.actual);
    const inside=nodes.filter(node=>node.ring<6);
    const outside=nodes.filter(node=>node.ring>=6);
    const span=sector.end-sector.start;
    const groups=4;
    for(let g=0;g<groups;g++){
      const chunk=inside.filter((_,i)=>i%groups===g);
      const center=sector.start+span*(g+.5)/groups;
      // Blocks have different length, width and radius. This breaks the mechanical symmetry
      // while retaining category-specific sector boundaries and enough visual separation.
      const columns=4+(g+sectorIndex)%3;
      const rows=Math.ceil(chunk.length/columns);
      const spacingAngle=Math.min(.018,span/(groups*columns*1.28));
      const radialStep=Math.min(10.4,115/Math.max(1,rows-1));
      const centerRadius=157+((g*7+sectorIndex*3)%4)*10;
      for(let i=0;i<chunk.length;i++){
        const col=i%columns;
        const row=Math.floor(i/columns);
        const a=center+(col-(columns-1)/2)*spacingAngle;
        const r=centerRadius+row*radialStep;
        positions.set(chunk[i].id,{x:Math.cos(a)*r,y:Math.sin(a)*r});
      }
    }
    // Stable, narrow gaps separate the small outlined icons along the outer orbit.
    const rings=[...new Set(outside.map(node=>node.ring))].sort((a,b)=>a-b);
    for(const ring of rings){
      const members=outside.filter(node=>node.ring===ring);
      const radius=layout.rings[ring];
      const groupGap=Math.min(.052,span*.095);
      const available=span-groupGap*2;
      for(let i=0;i<members.length;i++){
        const fraction=(i+.5)/members.length;
        const a=sector.start+groupGap+available*fraction;
        positions.set(members[i].id,{x:Math.cos(a)*radius,y:Math.sin(a)*radius});
      }
    }
  }
  return positions;
}
