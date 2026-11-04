// out: walls/rock-wall-light
// variants: 4
// seamless: blend
#version 3.7;
#include "common.inc"
object { KeyLight }
object { FillLight }

// Raw rock seen from above - the stone a corridor is cut out of. For stamping walls, and for the
// rock layer in Carve mode. Pale limestone rather than grey granite, so a carved passage reads dark
// against it.
//
// This one is a `blend` scene, and that is the whole point of the mode. Rock does not fracture into
// anything periodic: it breaks into irregular cells, which is exactly POV's `crackle` pattern, and
// crackle has no period at all. Built from sines it would come out as rolling lumps - the first
// attempt did, and looked like a heap of cushions. So the scene uses the pattern that is actually
// right for the material, is rendered a little wider than one period, and render.mjs cross-fades
// the overlap onto the far edge. Broken stone is the ideal case for that: there is no long straight
// structure for the blend band to smear.

#declare R = VSeed(9377);

#declare StoneDeep = <0.022, 0.020, 0.016>;
#declare StoneDark = <0.105, 0.096, 0.078>;
#declare StoneMid  = <0.330, 0.310, 0.262>;
#declare StoneLit  = <0.560, 0.535, 0.465>;
#declare StoneTop  = <0.720, 0.692, 0.610>;

// The rock face. Three scales of crackle: the blocks it breaks into, the flakes on each block, and
// the grain of the stone itself. The deep clefts between blocks are what make it read as a wall.
plane { y, 0
  texture {
    pigment {
      average
      pigment_map {
        // blocks: wide cells, each a slightly different tone of limestone
        [3.0 crackle color_map {
          [0.00 rgb StoneDeep]
          [0.075 rgb StoneDark]
          [0.16 rgb StoneMid]
          [0.45 rgb StoneLit]
          [1.00 rgb StoneTop] } scale 1.35 turbulence 0.30 ]
        // flakes: the same break-up one level down, so no block is flat
        [1.8 crackle color_map {
          [0.00 rgb StoneDark]
          [0.10 rgb StoneMid]
          [0.60 rgb StoneLit]
          [1.00 rgb StoneTop] } scale 0.42 turbulence 0.45 ]
        // grain
        [1.2 granite color_map { [0 rgb StoneDark][1 rgb StoneTop] } scale 0.040 ]
        [0.8 granite color_map { [0 rgb StoneMid*0.8][1 rgb StoneTop*1.05] } scale 0.009 ]
      }
    }
    // Relief: the cleft network cut deep, the flake edges shallow, plus grain.
    normal {
      average
      normal_map {
        [3.2 crackle 2.6 scale 1.35 turbulence 0.30 ]
        [1.6 crackle 1.1 scale 0.42 turbulence 0.45 ]
        [1.0 granite 0.7 scale 0.035 ]
        [0.7 bumps   0.5 scale 0.012 ]
      }
    }
    finish { diffuse 0.92 specular 0.04 roughness 0.16 }
  }
}

// Loose chips caught on the ledges. Real geometry, so they cast real shadows and give the surface
// a sense of depth that a normal map alone does not.
#declare Chips = union {
  #declare i = 0;
  #while (i < 190)
    #declare cr = 0.022 + pow(rand(R), 2.6)*0.19;
    #declare cg = 0.35 + rand(R)*0.60;
    superellipsoid { <0.70, 0.62>
      texture {
        pigment { granite color_map {
          [0 rgb StoneDark*(0.85 + cg*0.5)][1 rgb StoneMid*(0.85 + cg*0.45)] } scale 0.28 }
        normal { bumps 0.8 scale 0.20 }
        finish { diffuse 0.90 specular 0.07 roughness 0.11 }
      }
      scale <cr*(0.55 + rand(R)*0.95), cr*0.17, cr*(0.55 + rand(R)*0.95)>
      rotate y*rand(R)*360
      translate FramePos(R) + y*0.012
    }
    #declare i = i + 1;
  #end
}
object { Chips }

// Pale dust gathered in the hollows.
#declare Dust = union {
  #declare i = 0;
  #while (i < 22)
    #declare dr = 0.25 + pow(rand(R), 1.5)*0.85;
    sphere { 0, 1
      texture {
        pigment { bozo color_map {
          [0.0 rgbt <0.60,0.575,0.505, 0.35>]
          [0.55 rgbt <0.48,0.455,0.395, 0.74>]
          [1.0 rgbt <0.4,0.4,0.4, 1.0>] } scale 0.3 }
        finish { diffuse 0.94 specular 0 }
      }
      scale <dr, 0.008, dr*(0.55 + rand(R)*0.7)>
      rotate y*rand(R)*360
      translate FramePos(R) + y*0.020
    }
    #declare i = i + 1;
  #end
}
object { Dust }
