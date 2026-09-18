# S-2 Cloud Explorer Requirements

I want to build a web app, just a simple MVP that can help explore cloud masking using Sentinel-2 data.

## Basic view

It should be a SPA, with a map as a main view. I want to use MapLibre, and deck.gl raster to display a view
of the Pacific, using data listed in this STAC API: https://stac.digitalearthpacific.org/ and specifically,
the dep_s2_geomad product. There should be a year picker, from 2017-2025, to choose the year. Display in RGB
with an option to show the single band `count`.

## Cloud masking

I want to be able to select a location, probably a point location, and a pixel radius, say, a 256 x 256 pixel
"tile" (configurable), and then find all the S-2 scenes from the earth search STAC API https://earth-search.aws.element84.com/v1/
and the product, `sentinel-2-l2a`. We should show the number of scenes found. Once found, we load the SCL band
and do the cloud masking tasks shown in the repo ../dep-geomad. I want to be able to select the different SCL values,
and apply different dilation/erosion/etc. functions to them, before using that as a mask on the RGB data for the tile we have in memory.

## What we see

I think the cloud masking function should sit on top of the main view, and show a stack of images, sideways,
and the mask with the option to switch to the RGB with mask applied. And should show a view of the decomposed
masking options.

## MVP

For now, let's get the basics working, and then we can deep dive into more options for the actual masking, as seen
in the geomad repo function at src.utils.mask_clouds.

## References

* https://github.com/auspatious/cogniscient accessible at ../../auspatious/cogniscient
* https://github.com/digitalearthpacific/dep-geomad accessible at ../dep-geomad
