# Splash Wash

A 3D power-washing game in the browser, built with three.js.

**Play:** https://andanic.github.io/bubble-wash/

Hold a finger on the dirty thing to blast the mess off with the pressure washer; swipe beside it to walk around. Wash beach balls, a football, a rubber duck, a teddy, a pig, a dog, a sheep, a cow, a horse, a car, a van and a tractor, covered in mud, sand, moss, grime or clay. 12 hand-made levels, then new ones keep coming.

Every object is modelled as signed distance functions and meshed in a web worker (surface nets), so the dirt can live per vertex and wash off anywhere the jet hits.

Run locally with any static server, e.g. `python3 -m http.server`.
