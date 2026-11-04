// out: liquids/lava-fine
// variants: 2
#version 3.7;
#include "common.inc"
object { KeyLight }

// The same recipe at twice the frequency: a broken crust of small pools, which repeats far less visibly when a large area is painted with it.
#declare FREQ = 2;
#include "lava-body.inc"
