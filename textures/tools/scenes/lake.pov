// out: liquids/water-deep
// variants: 3
// seamless: blend
#version 3.7;
#include "common.inc"
object { KeyLight }
object { FillLight }

// Still, weedy water - the murky pond, where liquids/water-lake is open water with caustics.
//
//   - wrapped, and therefore periodic: the silted bottom, sunken stones, a weed bed;
//   - chaotic, and therefore free: the lily pads, leaves, scum, bubbles and glints are scattered by
//     FramePos() over the whole frame. This is a `blend` scene, so the border is handled by the
//     cross-fade and they need no margin - an earlier version kept them clear of the edge instead,
//     which left an empty ring and made the water read as a grid of clumps once tiled.
//
// Two things had to be got right, and the first version had neither.
//
// The water has to carry the texture itself. It was given `normal ... 0.16` against a `specular
// 0.45`, which is almost no ripple for the highlight to catch, and `fade_distance 0.45`, which
// extinguished the bottom, the stones and the weed bed that were supposed to be read through it.
// What was left was a flat dark field. The ripple is now strong enough to be lit and the water
// clear enough to see into, so the depth comes from the scene rather than from a pigment ramp.
//
// Scattered objects have to be texture, not landmarks. Twelve bright lily pads at a ninth of the
// tile across are things the eye can count and remember, so their arrangement is what you see when
// the tile repeats - no amount of seamlessness hides that, because there is no seam involved. The
// cure is the feature size: many small low-contrast ones read as material, few large bright ones
// read as a pattern. They are smaller, more numerous, and much closer to the water in tone.

#declare fRipple = function(u, v) { fLow(u, v)*0.52 + fWave(u, v)*0.48 }
// Depth carries the variation, because colour is the only channel here that is free. Perturbing
// the normal instead drives the white specular AND the sky reflection, so the surface turns grey
// and corrugated long before it looks like water - measured twice, at normal 0.55 and at 0.26.
//
// And it has to be stretched, which is the whole reason this texture was a flat slab. Each field
// in common.inc is centred on 0.5 with a standard deviation of about 0.3. Blending several with
// weights that sum to 1 averages them, so the result is *narrower* than any one of them: the old
// fLow*0.65 + fField2*0.35 had a sigma near 0.22 and therefore spent its life between 0.28 and
// 0.72. A colour map laid out over 0 to 1 never saw its own ends - the two colours doing the work
// were the middle two, a few percent apart, and no amount of editing the outer stops changed
// anything, because nothing ever reached them. Stretch the deviation about 0.5 and the map is
// used as written.
// 2.4 was too much: fDepth's sigma before stretching is about 0.18, so 2.4 takes it to 0.42 and a
// field centred on 0.5 then spends whole regions outside 0..1, where a colour map has nothing left
// to say. Those regions came out as flat dark islands with hard edges - and because they are the
// *water's own* pigment, three passes spent blaming the weed bed, the scum and the sunken stones
// changed nothing, which should have been the clue much earlier than it was. 1.6 keeps roughly two
// sigma inside the map.
#declare STRETCH = 1.6;
#declare fMix    = function(a, b, c) { 0.5 + ((a - 0.5) + (b - 0.5) + (c - 0.5))*STRETCH }
#declare fDepth  = function(u, v) { fMix(fLow(u, v)*0.42 + 0.29, fField2(u*2, v*2)*0.30 + 0.35, fField(u*4, v*4)*0.28 + 0.36) }
#declare fWeed   = function(u, v) { 0.5 + ((fLow(u*2, v*2) - 0.5)*0.55 + (fField(u*3, v*3) - 0.5)*0.45)*1.25 }

#declare R = VSeed(2291);

// ---- bottom -----------------------------------------------------------------------------------

plane { y, -0.62
  texture {
    pigment {
      average
      pigment_map {
        [1.2 function { fField2(x/P, z/P) } color_map { [0 rgb <0.075,0.115,0.082>][1 rgb <0.215,0.238,0.165>] } ]
        [0.7 granite color_map { [0 rgb <0.060,0.098,0.072>][1 rgb <0.235,0.260,0.180>] } scale 0.09 ]
        // The weed has to be much darker than the silt, not a shade of it. Everything in this scene
        // sat between 0.01 and 0.12, so the whole picture had a standard deviation of 0.025 and no
        // room left for any structure to be seen in: making the pond shallower and clearer moved
        // the result by 0.3% RMSE, because there was nothing down there to let through.
        [3.0 function { fWeed(x/P, z/P) } color_map {
              [0.00 rgb <0.010,0.026,0.014>][0.33 rgb <0.022,0.048,0.026>]
              [0.67 rgb <0.062,0.104,0.060>][1.00 rgb <0.150,0.185,0.118>] } ]
        [0.6 granite color_map { [0 rgb <0.010,0.026,0.013>][1 rgb <0.150,0.190,0.115>] } scale 0.035 ]
      }
    }
    finish { diffuse 0.80 specular 0 }
  }
}

#declare Stones = union {
  #declare i = 0;
  #while (i < 70)
    // Paler than the silt, not darker. These kept the values they had when the bottom ran from
    // 0.030 to 0.105; once it ran from 0.075 to 0.215 the same numbers made them the darkest thing
    // down there, and seventy overlapping flattened spheres became lobed dark islands - which is
    // what the last three passes were chasing, blaming the weed and then the scum in turn.
    #declare pr = 0.07 + pow(rand(R), 2.6)*0.24;
    #declare pg = 0.135 + rand(R)*0.085;
    sphere { 0, 1
      texture { pigment { rgb <pg*0.85, pg*1.00, pg*0.80> } normal { bumps 0.6 scale 0.3 } finish { diffuse 0.75 specular 0 } }
      scale <pr, pr*0.30, pr*(0.8 + rand(R)*0.5)>
      rotate y*rand(R)*360
      translate <rand(R)*P, -0.62 + pr*0.08, rand(R)*P>
    }
    #declare i = i + 1;
  #end
}
Wrap(Stones)

// The weed bed used to be eighty flattened spheres. Seen from straight above, a flattened sphere
// is a blob with a soft edge, and eighty of them are eighty blobs - the same complaint as the lily
// pads, one layer down. It is a pigment on the bottom now: broad dark masses that the water is
// read through, which is what it was always meant to look like.

// ---- surface ------------------------------------------------------------------------------------

plane { y, 0
  texture {
    pigment { function { fDepth(x/P, z/P) } color_map { [0 rgbf <0.014,0.058,0.062, 0.44>][0.35 rgbf <0.030,0.100,0.098, 0.58>][0.7 rgbf <0.064,0.170,0.150, 0.70>][1 rgbf <0.118,0.250,0.210, 0.80>] } }
    normal { function { fRipple(x/P, z/P) } 0.17 }
    // specular 0.30 was 36% of this picture's entire brightness - 0.073 of a mean of 0.201 - and
    // with the ripple this gentle it is very nearly the same 0.073 at every pixel. A constant add
    // that large leaves the pigment only the remainder to vary within, which is why the water read
    // as one flat tone no matter what the colour map said. The README calls this out for flat
    // ground; a surface with a slight normal is the same trap wearing a disguise.
    finish { diffuse 0.55 specular 0.07 roughness 0.030 reflection { 0.012, 0.07 fresnel } }
  }
    // The bottom sits at -0.62 and the water clears at 0.88, which together decide how much of the
    // weed bed is read through the surface. At the old 1.1 deep and 0.45 clear it contributed under
    // a tenth, so everything the bottom had to say was thrown away and the water was a flat slab.
  interior { ior 1.33 fade_distance 0.88 fade_power 2 fade_color <0.016, 0.054, 0.050> }
}

// ---- chaos in the middle ------------------------------------------------------------------------

// Lily pads: flat discs with a notch, floating just above the surface.
#declare Pads = union {
  #declare i = 0;
  #while (i < 24)
    #declare pr = 0.16 + rand(R)*0.20;
    #declare pg = 0.050 + rand(R)*0.055;
    difference {
      cylinder { <0,0,0>, <0,0.02,0>, 1 }
      box { <-0.16, -0.1, 0>, <0.16, 0.12, 1.25> rotate y*rand(R)*360 }
      texture {
        pigment { granite color_map { [0 rgb <pg*0.45, pg*0.90, pg*0.48>][1 rgb <pg*0.95, pg*1.25, pg*0.65>] } scale 0.4 }
        normal { bumps 0.5 scale 0.25 }
        finish { diffuse 0.70 specular 0.05 roughness 0.2 }
      }
      scale <pr, 1, pr*(0.88 + rand(R)*0.24)>
      rotate y*rand(R)*360
      translate FramePos(R) + y*0.012
    }
    #declare i = i + 1;
  #end
}
object { Pads }

// Fallen leaves and bits of bark, darker and smaller.
#declare Litter = union {
  #declare i = 0;
  #while (i < 38)
    #declare pr = 0.05 + pow(rand(R), 2.0)*0.14;
    #declare pg = 0.042 + rand(R)*0.055;
    superellipsoid { <0.75, 0.30>
      texture {
        pigment { rgb <pg*0.95, pg*0.82, pg*0.48> }
        finish { diffuse 0.80 specular 0.05 roughness 0.2 }
      }
      scale <pr, 0.012, pr*(0.35 + rand(R)*0.4)>
      rotate y*rand(R)*360
      translate FramePos(R) + y*0.008
    }
    #declare i = i + 1;
  #end
}
object { Litter }

// There used to be a scum layer here: twenty flattened spheres with a bozo pigment, meant to break
// up open water. It was pale against near-black water and read as blobs; once the water carried its
// own mottling it was darker than its surroundings and read as hard-edged islands, which is worse.
// The job it was invented for is done by fDepth and fWeed, which have no edges to give away.

// Bubbles and glints: tiny bright specks, the only sharp highlights on the water.
#declare Glints = union {
  #declare i = 0;
  #while (i < 70)
    #declare pr = 0.010 + pow(rand(R), 2.5)*0.038;
    sphere { 0, 1
      texture {
        pigment { rgb <0.60, 0.72, 0.72> }
        finish { diffuse 0.3 specular 0.7 roughness 0.010 emission 0.10 }
      }
      scale <pr, pr*0.6, pr>
      translate FramePos(R) + y*0.01
    }
    #declare i = i + 1;
  #end
}
object { Glints }

sky_sphere { pigment { gradient y color_map { [0.0 rgb <0.045,0.060,0.075>][1.0 rgb <0.130,0.165,0.200>] } } }
