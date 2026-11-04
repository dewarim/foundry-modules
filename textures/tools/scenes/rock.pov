// out: floors/rock-grey
// variants: 3
// seamless: blend
#version 3.7;
#include "common.inc"
object { KeyLight }
object { FillLight }

// Natural rock seen from above: mottled grey stone with a branching crack network and scattered
// rubble.
//
// The cracks used to be a periodic contour - a level set of fVein, which is a sum of sines. That is
// what made this the weakest texture here, and the reason is in the README two sections up, written
// for rock-wall-light and never applied back to this scene: stone does not break into anything a
// sine can describe. A level set of a smooth band-limited field is a set of smooth closed loops of
// near-constant width, so the "cracks" were worms - and thinning them only made them thinner worms.
// Measuring made the second half of it plain too: fCrack reached the texture_map's first stop on
// 18.1% of the surface and its last on 1.13%, so a sixth of the floor was a half-blended smear with
// a dark core almost nowhere.
//
// Real fracture is irregular cells, which is `crackle`, which has no period - so this is a `blend`
// scene now, and broken stone is the ideal case for the cross-fade: no long straight structure for
// the blend band to smear.

#declare StoneTex = texture {
  pigment {
    average
    pigment_map {
      [2.4 function { fField2(x/P, z/P) } color_map { [0 rgb <0.042,0.040,0.038>][1 rgb <0.255,0.248,0.232>] } ]
      [1.8 granite color_map { [0 rgb <0.028,0.027,0.026>][0.5 rgb <0.130,0.128,0.120>][1 rgb <0.310,0.300,0.280>] } scale 0.40 ]
      [1.2 granite color_map { [0 rgb <0.065,0.062,0.060>][1 rgb <0.260,0.255,0.242>] } scale 0.045 ]
      // a finer fracture network inside each block, so the stone is not smooth between the cracks
      [1.6 crackle color_map {
             [0.00 rgb <0.052,0.050,0.047>][0.05 rgb <0.090,0.086,0.081>]
             [0.22 rgb <0.175,0.170,0.160>][1.00 rgb <0.205,0.200,0.188>] } scale 0.42 ]
    }
  }
  normal { granite 1.2 scale 0.05 }
  finish { diffuse 0.85 specular 0 }
}

// A crack is a shaded groove in stone, not a hole through it: near-black reads as a gap.
#declare CrackTex = texture {
  pigment { rgb <0.048,0.046,0.043> }
  finish { diffuse 0.50 specular 0 }
}

// crackle is near zero along the boundary between two cells, so the crack is the low end of it,
// and the stops decide the width. They have to be much narrower than they look: 0.020/0.060 gave
// black channels a finger wide and the floor read as crazy paving. 0.004/0.016 is a fracture.
plane { y, 0
  texture {
    crackle
    texture_map { [0.000 CrackTex][0.004 CrackTex][0.016 StoneTex][1.000 StoneTex] }
    scale 0.95
  }
}

// Rubble lying on the rock.
#declare R = VSeed(4409);
#declare Rubble = union {
  #declare i = 0;
  #while (i < 150)
    #declare pr = 0.05 + pow(rand(R), 2.8)*0.33;
    #declare pg = 0.050 + rand(R)*0.105;
    superellipsoid { <0.80, 0.80>
      texture {
        pigment { granite color_map { [0 rgb <pg*0.75, pg*0.74, pg*0.70>][1 rgb <pg*1.35, pg*1.33, pg*1.26>] } scale 0.30 }
        normal { bumps 1.1 scale 0.22 }
        finish { diffuse 0.85 specular 0.05 roughness 0.12 }
      }
      scale <pr*(0.55 + rand(R)*0.9), pr*0.17, pr*(0.55 + rand(R)*0.9)>
      rotate y*rand(R)*360
      translate <rand(R)*P, pr*0.08, rand(R)*P>
    }
    #declare i = i + 1;
  #end
}
Wrap(Rubble)
