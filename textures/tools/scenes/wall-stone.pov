// out: walls/block-wall-grey
// variants: 3
#version 3.7;
#include "common.inc"
object { KeyLight }
object { FillLight }

// A dressed block wall from above: a running bond of rounded blocks over a dark mortar bed. The bond
// is an exact lattice over the period (COLS x ROWS with a half-block offset on alternate courses),
// so the pattern tiles; Wrap() carries the blocks that cross the border to the other side.
#declare COLS = 4;
#declare ROWS = 7;
#declare BW = P/COLS;
#declare BH = P/ROWS;
#declare GAP = 0.055;

// Mortar bed, recessed.
plane { y, -0.16
  texture {
    pigment {
      average
      pigment_map {
        [2.0 function { fField2(x*2/P, z*2/P) } color_map { [0 rgb <0.022,0.021,0.018>][1 rgb <0.062,0.058,0.050>] } ]
        [1.0 granite color_map { [0 rgb <0.016,0.015,0.014>][1 rgb <0.070,0.065,0.056>] } scale 0.03 ]
      }
    }
    normal { granite 0.8 scale 0.025 }
    finish { diffuse 0.75 specular 0 }
  }
}

#declare R = VSeed(5153);
#declare Blocks = union {
  #declare ry = 0;
  #while (ry < ROWS)
    #declare cx = 0;
    #while (cx < COLS)
      #declare jx = (rand(R) - 0.5)*0.10;
      #declare jz = (rand(R) - 0.5)*0.06;
      #declare pg = 0.100 + rand(R)*0.115;
      superellipsoid { <0.22, 0.22>
        texture {
          pigment {
            average
            pigment_map {
              [2.0 granite color_map { [0 rgb <pg*0.72, pg*0.70, pg*0.63>][1 rgb <pg*1.40, pg*1.36, pg*1.22>] } scale 0.55 ]
              [1.0 granite color_map { [0 rgb <pg*0.85, pg*0.83, pg*0.78>][1 rgb <pg*1.20, pg*1.18, pg*1.10>] } scale 0.06 ]
            }
          }
          normal { granite 0.9 scale 0.05 }
          finish { diffuse 0.85 specular 0.04 roughness 0.10 }
        }
        scale <(BW - GAP*2)/2, 0.22 + rand(R)*0.05, (BH - GAP*2)/2>
        rotate y*(rand(R) - 0.5)*1.2
        translate <(cx + 0.5)*BW + mod(ry, 2)*BW/2 + jx, 0, (ry + 0.5)*BH + jz>
      }
      #declare cx = cx + 1;
    #end
    #declare ry = ry + 1;
  #end
}
Wrap(Blocks)
