// out: floors/wood-planks
// variants: 3
#version 3.7;
#include "common.inc"
object { KeyLight }
object { FillLight }

// A plank floor. The planks run along x and span the whole period, so the lattice tiles by itself:
// ROWS planks stacked in z, each one wrapped so the boards at the edge continue on the other side.
//
// The grain is a function of the across-plank coordinate wobbled by a sum of sines in x. Only the x
// term has to be periodic, and it is - which leaves the phase free, so every plank can be shifted
// along its length by a random amount and still meet itself at the border.

#declare ROWS = 6;
#declare BH = P/ROWS;
#declare GAP = 0.045;

#declare R = VSeed(8609);

// Grain: w runs across the board, u along it. The wobble is periodic in u, so the board's pattern
// closes on itself; RINGS sets how many grain lines cross the board.
#declare fGrain = function(u, w) {
  0.5 + 0.42*sin(2*pi*w
                 + 2.30*sin(2*pi*(1*u) + 0.70)
                 + 1.15*sin(2*pi*(2*u) + 2.25)
                 + 0.55*sin(2*pi*(3*u) + 4.80))
}

// The dark bed seen in the gaps between boards.
plane { y, -0.30
  texture {
    pigment { rgb <0.016, 0.011, 0.007> }
    finish { diffuse 0.55 specular 0 }
  }
}

#declare Planks = union {
  #declare ry = 0;
  #while (ry < ROWS)
    #declare shift = rand(R);                       // phase along the board: free, still periodic
    #declare rings = 2 + floor(rand(R)*4);          // grain lines across this board
    #declare tone  = 0.72 + rand(R)*0.62;           // a lighter or darker board
    #declare warm  = 0.90 + rand(R)*0.22;
    box { <-P, -0.3, -(BH - GAP*2)/2>, <P*2, 0, (BH - GAP*2)/2>
      texture {
        pigment {
          function { fGrain(x/P + shift, z*rings/BH) }
          color_map {
            [0.00 rgb <0.052*tone*warm, 0.030*tone, 0.014*tone>]
            [0.35 rgb <0.105*tone*warm, 0.062*tone, 0.028*tone>]
            [0.72 rgb <0.165*tone*warm, 0.103*tone, 0.050*tone>]
            [1.00 rgb <0.215*tone*warm, 0.140*tone, 0.070*tone>]
          }
        }
        normal {
          average
          normal_map {
            [1.0 function { fGrain(x/P + shift, z*rings/BH) } 0.5 ]
            [1.0 granite 0.35 scale 0.012 ]
          }
        }
        finish { diffuse 0.80 specular 0.05 roughness 0.09 }
      }
      translate <0, 0, (ry + 0.5)*BH>
    }
    #declare ry = ry + 1;
  #end
}
Wrap(Planks)

// ---- chaos in the middle ------------------------------------------------------------------------

// Knots. A knot is a dark lens with a ring around it; it may sit anywhere clear of the border.
#declare Knots = union {
  #declare i = 0;
  #while (i < 9)
    #declare kr = 0.07 + pow(rand(R), 1.8)*0.16;
    union {
      cylinder { <0,-0.05,0>, <0,0.004,0>, 1.45
        texture { pigment { rgb <0.058, 0.032, 0.014> } finish { diffuse 0.70 specular 0.04 roughness 0.1 } } }
      cylinder { <0,-0.05,0>, <0,0.006,0>, 1.0
        texture { pigment { rgb <0.028, 0.015, 0.007> } finish { diffuse 0.60 specular 0.03 roughness 0.1 } } }
      scale <kr, 1, kr*(1.5 + rand(R)*1.4)>
      rotate y*(rand(R) - 0.5)*26
      translate InnerPosM(R, kr*3)
    }
    #declare i = i + 1;
  #end
}
object { Knots }

// Butt joints: a dark cut straight across one board, well inside the tile.
#declare Joints = union {
  #declare i = 0;
  #while (i < 4)
    #declare jr = floor(rand(R)*ROWS);
    box { <-0.022, -0.02, -(BH - GAP*2)/2>, <0.022, 0.004, (BH - GAP*2)/2>
      texture { pigment { rgb <0.020, 0.013, 0.007> } finish { diffuse 0.50 specular 0 } }
      translate <INNER_MARGIN*P + rand(R)*(P - 2*INNER_MARGIN*P), 0, (jr + 0.5)*BH>
    }
    #declare i = i + 1;
  #end
}
object { Joints }

// Nail heads at the board ends, a dull metal glint.
#declare Nails = union {
  #declare i = 0;
  #while (i < 16)
    #declare nr = 0.020 + rand(R)*0.012;
    sphere { 0, 1
      texture {
        pigment { rgb <0.085, 0.080, 0.072> }
        finish { diffuse 0.55 specular 0.35 roughness 0.04 }
      }
      scale <nr, nr*0.45, nr>
      translate InnerPosM(R, nr) + y*0.004
    }
    #declare i = i + 1;
  #end
}
object { Nails }
