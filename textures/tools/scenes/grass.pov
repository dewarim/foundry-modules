// out: ground/grass
// variants: 3
#version 3.7;
#include "common.inc"
object { KeyLight }
object { FillLight }

// Meadow grass from above. The ground is a periodic field of greens, the blades are real geometry -
// a few thousand thin flat slivers - and the eye reads the blades, not the ground. Everything that
// could touch the border is wrapped; the flowers, bare scrapes and taller tufts sit in the middle
// where nothing has to be periodic.

#declare R = VSeed(3301);

#declare EarthDark = <0.040, 0.044, 0.022>;
#declare GrassDark = <0.055, 0.105, 0.030>;
#declare GrassMid  = <0.110, 0.195, 0.055>;
#declare GrassLit  = <0.205, 0.300, 0.085>;

plane { y, 0
  texture {
    pigment {
      average
      pigment_map {
        [2.4 function { fField(x/P, z/P) } color_map { [0 rgb EarthDark][0.45 rgb GrassDark][1 rgb GrassMid] } ]
        [1.6 granite color_map { [0 rgb EarthDark][0.5 rgb GrassDark][1 rgb GrassMid] } scale 0.30 ]
        [1.0 granite color_map { [0 rgb EarthDark*0.8][1 rgb GrassMid*1.1] } scale 0.05 ]
      }
    }
    normal { granite 0.8 scale 0.05 }
    finish { diffuse 0.85 specular 0 }
  }
}

// Blades: thin slivers lying at every angle, in a spread of greens. Each is textured before it is
// moved, so its wrapped copies carry the same colour.
#declare Blades = union {
  #declare i = 0;
  #while (i < 2600)
    #declare bl = 0.09 + pow(rand(R), 1.7)*0.30;
    #declare bg = rand(R);
    superellipsoid { <1.00, 0.45>
      texture {
        pigment { rgb GrassDark + (GrassLit - GrassDark)*pow(bg, 0.8) }
        finish { diffuse 0.90 specular 0.06 roughness 0.15 }
      }
      scale <bl, 0.012 + rand(R)*0.020, 0.0075 + rand(R)*0.009>
      rotate y*rand(R)*360
      translate <rand(R)*P, 0, rand(R)*P>
    }
    #declare i = i + 1;
  #end
}
Wrap(Blades)

// Tussocks: denser, slightly raised clumps.
#declare Tufts = union {
  #declare i = 0;
  #while (i < 38)
    #declare tr = 0.18 + pow(rand(R), 1.6)*0.45;
    #declare tg = 0.55 + rand(R)*0.45;
    sphere { 0, 1
      texture {
        pigment { granite color_map { [0 rgb GrassDark*1.1][1 rgb GrassLit*tg] } scale 0.10 }
        normal { bumps 1.6 scale 0.035 }
        finish { diffuse 0.88 specular 0.05 roughness 0.2 }
      }
      scale <tr, tr*0.20, tr*(0.75 + rand(R)*0.5)>
      rotate y*rand(R)*360
      translate <rand(R)*P, 0.01, rand(R)*P>
    }
    #declare i = i + 1;
  #end
}
Wrap(Tufts)

// ---- chaos in the middle ------------------------------------------------------------------------

// Bare scrapes: patches of trodden earth showing through.
#declare Scrapes = union {
  #declare i = 0;
  #while (i < 7)
    #declare sr = 0.25 + pow(rand(R), 1.4)*0.70;
    sphere { 0, 1
      texture {
        pigment { granite color_map { [0 rgb <0.075,0.058,0.034>][0.6 rgb <0.130,0.100,0.058>][1 rgb <0.190,0.150,0.090>] } scale 0.18 }
        normal { granite 1.0 scale 0.04 }
        finish { diffuse 0.85 specular 0 }
      }
      scale <sr, 0.008, sr*(0.6 + rand(R)*0.7)>
      rotate y*rand(R)*360
      translate InnerPosM(R, sr) + y*0.022
    }
    #declare i = i + 1;
  #end
}
object { Scrapes }

// Flowers: small bright heads, a handful of colours.
#declare Flowers = union {
  #declare i = 0;
  #while (i < 44)
    #declare fr = 0.030 + rand(R)*0.045;
    #declare pick = rand(R);
    #declare fc = <0.85, 0.82, 0.55>;                             // white daisies
    #if (pick > 0.40) #declare fc = <0.80, 0.70, 0.12>; #end      // buttercups
    #if (pick > 0.68) #declare fc = <0.52, 0.38, 0.62>; #end      // scabious
    #if (pick > 0.86) #declare fc = <0.78, 0.40, 0.42>; #end      // campion
    sphere { 0, 1
      texture { pigment { rgb fc } finish { diffuse 0.90 specular 0.10 roughness 0.2 emission 0.04 } }
      scale <fr, fr*0.5, fr*(0.85 + rand(R)*0.3)>
      translate InnerPosM(R, fr) + y*0.035
    }
    #declare i = i + 1;
  #end
}
object { Flowers }
