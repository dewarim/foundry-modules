// Shared setup for seamless top-down textures.
//
// Seamlessness by construction: the camera is orthographic (all rays parallel, so shading does not
// depend on position in the frame), the lights are `parallel` (no falloff, so illumination is
// translation-invariant), and every scattered object that may cross the border is repeated over the
// 3x3 neighbourhood by Wrap(), so what leaves one side comes back on the other. Large-scale
// variation must come from periodic functions; POV's own noise patterns (granite, bozo, bumps) are
// not periodic and are only used above the spatial frequency where a seam could be seen.
//
// Only the *border* of the tile is actually constrained. Anything that stays clear of it may be as
// chaotic as it likes - see Inner() and InnerPos() below.
//
// One trap: with an orthographic camera, a parallel light and a flat surface the specular term is
// the same at every pixel. It is a flat grey wash, not a highlight. Keep `specular` near zero on
// flat ground and let it come back only where normals really vary.

global_settings { assumed_gamma 1.0 max_trace_level 12 }

#declare P = 10;  // world units covered by one tile period

// A different draw of the same recipe: povray ... Declare=Variant=2
// It shifts the phase of every periodic field and reseeds every scatter, so the variants differ in
// their arrangement while keeping the recipe, the palette and the feature sizes.
#ifndef (Variant) #declare Variant = 1; #end
#declare PH = (Variant - 1)*2.39996;  // the golden angle: successive variants stay far apart
#macro VSeed(Base) seed(Base + Variant*7919) #end

// A `blend` scene is rendered wider than one period; render.mjs sets Overlap and cross-fades the
// extra onto the far edge afterwards. For a `construction` scene Overlap is 0 and this is one period.
#ifndef (Overlap) #declare Overlap = 0; #end

camera { orthographic location <0, 60, 0> look_at <0, 0, 0> right x*P*(1 + Overlap) up z*P*(1 + Overlap) }

#declare KeyLight = light_source { <-0.55, 1.25, -0.75>*3000 color rgb 1.10 parallel point_at <0,0,0> };
#declare FillLight = light_source { <0.60, 0.95, 0.50>*3000 color rgb 0.30 parallel point_at <0,0,0> shadowless };

// Repeat an object over the 3x3 neighbourhood of the period, so border-crossing detail wraps.
#macro Wrap(Obj)
  union {
    #declare _wx = -1;
    #while (_wx <= 1)
      #declare _wz = -1;
      #while (_wz <= 1)
        object { Obj translate <_wx*P, 0, _wz*P> }
        #declare _wz = _wz + 1;
      #end
      #declare _wx = _wx + 1;
    #end
  }
#end

// A position at least Half from every edge of the *visible frame*. An object of that half-extent
// placed here cannot reach the border, so it needs no wrapping and nothing about it has to be
// periodic: its placement, its rotation and its own noise textures are all free. This is where
// chaos goes.
//
// Note the frame: the camera looks at the origin and covers -P/2 .. +P/2 on both axes. Wrapped
// scatters may be drawn anywhere in 0 .. P because Wrap() repeats them, but an object that is NOT
// wrapped has to be placed against the frame the camera actually sees, or it is cut in half at the
// image edge - which is a seam, and one the renderer will not mention.
#macro InnerPos(R, Half)
  <-P/2 + Half + rand(R)*(P - 2*Half), 0, -P/2 + Half + rand(R)*(P - 2*Half)>
#end

// Anywhere in the rendered frame, overlap included. For a `blend` scene, where the cross-fade takes
// care of the border, objects need no margin at all and should be spread over the whole frame:
// confining them to the middle leaves an empty ring that reads as a grid of clumps once tiled.
#macro FramePos(R)
  <(rand(R) - 0.5)*P*(1 + Overlap), 0, (rand(R) - 0.5)*P*(1 + Overlap)>
#end

// How much of the period each side is kept clear of chaotic detail, as a fraction.
#declare INNER_MARGIN = 0.10;

// A position in the inner area, keeping both the object's extent and the margin clear of the border.
#macro InnerPosM(R, Half)
  InnerPos(R, Half + INNER_MARGIN*P)
#end

// Sums of sines with whole-number frequencies: exactly periodic on the unit square, so safe at any
// scale. Every multiplier applied to u or v has to stay a whole number - test/scenes.test.mjs
// checks that, because a stray 1.5 destroys the period silently.

#declare fField = function(u, v) {
  0.50
  + 0.170*sin(2*pi*(1*u + 2*v) + 0.90 + PH*1)
  + 0.130*sin(2*pi*(2*u - 1*v) + 2.10 + PH*2)
  + 0.100*sin(2*pi*(3*u + 1*v) + 4.00 + PH*3)
  + 0.070*sin(2*pi*(1*u - 4*v) + 1.20 + PH*4)
  + 0.050*sin(2*pi*(5*u + 3*v) + 5.30 + PH*5)
  + 0.040*sin(2*pi*(4*u - 6*v) + 0.30 + PH*6)
  + 0.028*sin(2*pi*(7*u + 2*v) + 3.70 + PH*7)
  + 0.020*sin(2*pi*(8*u - 9*v) + 2.80 + PH*8)
}

// A second independent periodic field, for crack networks and cross-grain.
#declare fField2 = function(u, v) {
  0.50
  + 0.165*sin(2*pi*(2*u + 1*v) + 1.70 + PH*3)
  + 0.135*sin(2*pi*(1*u - 2*v) + 3.40 + PH*5)
  + 0.095*sin(2*pi*(3*u - 2*v) + 0.55 + PH*7)
  + 0.075*sin(2*pi*(2*u + 4*v) + 5.10 + PH*2)
  + 0.050*sin(2*pi*(5*u - 1*v) + 2.35 + PH*4)
  + 0.038*sin(2*pi*(6*u + 5*v) + 4.60 + PH*6)
  + 0.026*sin(2*pi*(3*u - 7*v) + 1.05 + PH*8)
  + 0.018*sin(2*pi*(9*u + 4*v) + 3.15 + PH*1)
}

// A deliberately smooth periodic field (low frequencies only): thresholding it gives large, clean
// regions instead of the ragged level set a full-spectrum field produces.
#declare fLow = function(u, v) {
  0.50
  + 0.230*sin(2*pi*(1*u + 1*v) + 0.40 + PH*2)
  + 0.185*sin(2*pi*(1*u - 2*v) + 2.60 + PH*3)
  + 0.130*sin(2*pi*(2*u + 1*v) + 4.90 + PH*5)
  + 0.085*sin(2*pi*(3*u - 1*v) + 1.55 + PH*7)
}

// An isotropic periodic field: the terms of fField/fField2 share a diagonal bias that shows up as a
// regular weave when they drive a surface normal, so wave work uses directions spread over the circle.
#declare fWave = function(u, v) {
  0.50
  + 0.110*sin(2*pi*( 3*u + 1*v) + 0.30 + PH*1)
  + 0.100*sin(2*pi*( 1*u + 3*v) + 1.90 + PH*2)
  + 0.090*sin(2*pi*( 3*u - 2*v) + 4.20 + PH*3)
  + 0.080*sin(2*pi*( 2*u - 3*v) + 2.70 + PH*4)
  + 0.070*sin(2*pi*( 4*u + 3*v) + 5.60 + PH*5)
  + 0.060*sin(2*pi*( 3*u + 5*v) + 0.90 + PH*6)
  + 0.050*sin(2*pi*( 5*u - 4*v) + 3.30 + PH*7)
  + 0.045*sin(2*pi*( 6*u + 1*v) + 1.40 + PH*8)
  + 0.035*sin(2*pi*( 1*u - 6*v) + 4.80 + PH*9)
  + 0.025*sin(2*pi*( 7*u + 6*v) + 2.20 + PH*10)
}

// A band along the 0.5 contour of a field: a closed, branching network of lines, exactly periodic.
#declare fVein  = function(u, v, w) { max(0, 1 - abs(fField(u, v)  - 0.5)/w) }
#declare fVein2 = function(u, v, w) { max(0, 1 - abs(fField2(u, v) - 0.5)/w) }
