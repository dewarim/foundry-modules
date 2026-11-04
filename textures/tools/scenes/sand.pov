// out: ground/sand
// variants: 3
// seamless: blend
#version 3.7;
#include "common.inc"
object { KeyLight }
object { FillLight }

// Sand. Wind ripples are a periodic field driving the surface normal; the grain is fine
// non-periodic noise, which is safe because a seam needs correlation along the cut and fine noise
// has none. The pebbles, shells and drag marks are scattered over the whole frame: this is a
// `blend` scene, so the cross-fade takes care of the border and they need no margin.

#declare fRipple = function(u, v) { fWave(u*2, v*2)*0.68 + fLow(u, v)*0.32 }

#declare R = VSeed(6113);

#declare SandDark = <0.175, 0.138, 0.088>;
#declare SandMid  = <0.300, 0.248, 0.165>;
#declare SandLit  = <0.430, 0.372, 0.258>;

plane { y, 0
  texture {
    pigment {
      average
      pigment_map {
        [2.6 function { fRipple(x/P, z/P) } color_map { [0 rgb SandDark][0.5 rgb SandMid][1 rgb SandLit] } ]
        [1.4 granite color_map { [0 rgb SandDark][1 rgb SandLit] } scale 0.35 ]
        [1.6 granite color_map { [0 rgb SandDark*0.85][1 rgb SandLit*1.12] } scale 0.018 ]
      }
    }
    normal {
      average
      normal_map {
        [2.2 function { fRipple(x/P, z/P) } 0.85 ]
        [1.0 granite 1.1 scale 0.014 ]
      }
    }
    finish { diffuse 0.88 specular 0.03 roughness 0.06 }
  }
}

// ---- chaos in the middle ------------------------------------------------------------------------

// Pebbles and grit washed up on the surface.
#declare Pebbles = union {
  #declare i = 0;
  #while (i < 70)
    #declare pr = 0.022 + pow(rand(R), 2.6)*0.17;
    #declare pg = 0.100 + rand(R)*0.130;
    sphere { 0, 1
      texture {
        pigment { granite color_map { [0 rgb <pg*0.78, pg*0.72, pg*0.62>][1 rgb <pg*1.25, pg*1.14, pg*0.95>] } scale 0.3 }
        normal { bumps 0.9 scale 0.25 }
        finish { diffuse 0.80 specular 0.07 roughness 0.12 }
      }
      scale <pr*(0.7 + rand(R)*0.6), pr*0.36, pr*(0.7 + rand(R)*0.6)>
      rotate y*rand(R)*360
      translate FramePos(R) - y*pr*0.12
    }
    #declare i = i + 1;
  #end
}
object { Pebbles }

// Shell fragments: pale, thin, catching a little more light than the sand.
#declare Shells = union {
  #declare i = 0;
  #while (i < 13)
    #declare sr = 0.045 + pow(rand(R), 1.7)*0.11;
    difference {
      sphere { 0, 1 }
      sphere { <0, -0.55, 0>, 1 }
      texture {
        pigment { rgb <0.520, 0.470, 0.395> }
        finish { diffuse 0.85 specular 0.22 roughness 0.035 }
      }
      scale <sr, sr*0.55, sr*(0.8 + rand(R)*0.45)>
      rotate x*(rand(R) - 0.5)*25
      rotate y*rand(R)*360
      translate FramePos(R) - y*sr*0.3
    }
    #declare i = i + 1;
  #end
}
object { Shells }

// Drag marks: shallow scoops where something was pulled across the sand.
#declare Marks = union {
  #declare i = 0;
  #while (i < 5)
    #declare mr = 0.30 + rand(R)*0.95;
    sphere { 0, 1
      texture {
        pigment { granite color_map { [0 rgbt <0.090,0.070,0.044, 0.25>][0.65 rgbt <0.150,0.122,0.080, 0.65>][1 rgbt <0.2,0.2,0.2, 1.0>] } scale 0.2 }
        finish { diffuse 0.85 specular 0 }
      }
      scale <mr, 0.006, mr*(0.16 + rand(R)*0.22)>
      rotate y*rand(R)*360
      translate FramePos(R) + y*0.004
    }
    #declare i = i + 1;
  #end
}
object { Marks }
