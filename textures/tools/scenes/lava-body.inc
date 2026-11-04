// The lava recipe, shared by lava.pov (coarse pools) and lava-fine.pov (a broken crust).
//
// FREQ is how many periods of the fields fit across the tile: 1 gives a few big pools, 2 gives four
// times as many at half the size. It must be a whole number or the tile stops being periodic, which
// is why test/scenes.test.mjs insists that a coordinate multiplier resolves to an integer.
#ifndef (FREQ) #declare FREQ = 1; #end
#declare FREQ2 = FREQ*2;

object { KeyLight }

// Lava: molten pools where a periodic field rises above a threshold, plus thin cracks along the
// contour of the other field. Every frequency multiplier is an integer, so period 1 is preserved and
// the tile has no seam. Crack width and glow vary along their length, to avoid a neon-tube look.
#declare fWide  = function(u, v) { min(1, max(0, (fLow(u*FREQ, v*FREQ) - 0.578)/0.085)) }
#declare fWidth = function(u, v) { 0.030 + 0.075*fField(u*FREQ2, v*FREQ2) }
#declare fThin  = function(u, v) { fVein(u*FREQ, v*FREQ, fWidth(u, v)) }
#declare fGlow  = function(u, v) { max(fWide(u, v), fThin(u, v)) * (0.74 + 0.30*fLow(u*FREQ2, v*FREQ2)) }

#declare CrustTex = texture {
  pigment {
    average
    pigment_map {
      [2.0 function { fField2(x*FREQ/P, z*FREQ/P) } color_map { [0 rgb <0.0130,0.0092,0.0082>][1 rgb <0.055,0.039,0.032>] } ]
      [1.4 granite color_map { [0 rgb <0.0085,0.0065,0.0062>][1 rgb <0.080,0.058,0.046>] } scale 0.075 ]
      [0.8 granite color_map { [0 rgb <0.0070,0.0052,0.0050>][1 rgb <0.066,0.045,0.034>] } scale 0.012 ]
    }
  }
  normal { granite 1.0 scale 0.055 }
  finish { diffuse 0.62 specular 0 }
}

#declare ScorchTex = texture {
  pigment { function { fField(x*FREQ/P, z*FREQ/P) } color_map { [0 rgb <0.050,0.017,0.007>][1 rgb <0.110,0.034,0.011>] } }
  normal { granite 0.7 scale 0.05 }
  finish { diffuse 0.55 specular 0 emission 0.06 }
}

#declare EmberTex = texture {
  pigment { function { fField(x*FREQ2/P, z*FREQ2/P) } color_map { [0 rgb <0.62,0.115,0.012>][1 rgb <0.92,0.235,0.022>] } }
  finish { diffuse 0.10 emission 1.15 }
}

#declare CoreTex = texture {
  pigment { function { fField2(x*FREQ2/P, z*FREQ2/P) } color_map { [0 rgb <1.00,0.44,0.055>][1 rgb <1.00,0.70,0.20>] } }
  finish { diffuse 0.0 emission 1.55 }
}

plane { y, 0
  texture {
    function { fGlow(x/P, z/P) }
    texture_map {
      [0.00 CrustTex]
      [0.34 CrustTex]
      [0.50 ScorchTex]
      [0.78 EmberTex]
      [1.00 CoreTex]
    }
  }
}
