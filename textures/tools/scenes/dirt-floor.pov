// out: floors/dirt
// variants: 4
#version 3.7;
#include "common.inc"
object { KeyLight }
object { FillLight }

// Packed earth: periodic large-scale patches, fine non-periodic grain, half-buried grit.
#declare EarthDark  = <0.075, 0.050, 0.030>;
#declare EarthMid   = <0.165, 0.115, 0.070>;
#declare EarthLight = <0.300, 0.220, 0.142>;

plane { y, 0
  texture {
    pigment {
      average
      pigment_map {
        [2.6 function { fField(x/P, z/P) } color_map { [0 rgb EarthDark][0.5 rgb EarthMid][1 rgb EarthLight] } ]
        [1.8 granite color_map { [0 rgb EarthDark*0.7][0.45 rgb EarthMid][1 rgb EarthLight*1.2] } scale 0.45 ]
        [1.2 granite color_map { [0 rgb EarthDark][1 rgb EarthLight] } scale 0.05 ]
      }
    }
    normal { granite 1.1 scale 0.045 }
    finish { diffuse 0.90 specular 0 }
  }
}

// Grit: flat stones sunk into the earth, so only an irregular cap shows and the edge stays soft.
#declare R = VSeed(7731);
#declare Grit = union {
  #declare i = 0;
  #while (i < 170)
    #declare pr = 0.040 + pow(rand(R), 3.4)*0.24;
    #declare pg = 0.085 + rand(R)*0.075;
    sphere { 0, 1
      texture {
        pigment { granite color_map { [0 rgb <pg*0.80, pg*0.68, pg*0.50>][1 rgb <pg*1.20, pg*1.02, pg*0.76>] } scale 0.35 }
        normal { bumps 0.8 scale 0.25 }
        finish { diffuse 0.85 specular 0.06 roughness 0.12 }
      }
      scale <pr*(0.8 + rand(R)*0.5), pr*0.30, pr*(0.8 + rand(R)*0.5)>
      rotate y*rand(R)*360
      translate <rand(R)*P, -pr*0.21, rand(R)*P>
    }
    #declare i = i + 1;
  #end
}
Wrap(Grit)
