# Changelog

## Unreleased

- First release. 41 seamless top-down images in 14 sets - raw rock and dressed masonry, a fractured
  cave floor, packed earth, board floors, grass, sand, lake water, deep water, lava and fine lava,
  and three line hatches - each with three or four variants that tile against themselves and each
  other.

- The 148 named web colours as flat 64x64 tiles, in `web-base` (the 16 HTML 4.01 names) and
  `web-extended` (the other 132): for blocking a map out quickly, "the floor is water", "stamp dark
  brown for earth". Written losslessly, so a colour is exactly its hex value.

- Nothing is painted by hand: every image is rendered from the POV-Ray scenes, SVG tiles and recipes
  in `tools/`, which ship with the module - so any texture can be recoloured, rescaled or reseeded
  and built again, and a new one is a new `.pov` file.

- Registers itself as a palette folder for *Dewarim: Map Painter*, which lists it as "Textures".
