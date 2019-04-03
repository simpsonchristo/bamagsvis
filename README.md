# University of Alabama Ground Station Visuals
FreeFlyer, Python, and Blender used to visualize real-time station tracking of satellites around the world and at University of Alabama. 
## Introduction
FreeFlyer is a flight dynamics software created by [a.i. solutions, Inc.](https://ai-solutions.com/). Using the Engineer tier of the software (the one distributed to students), a prototype of the real-time visual display of satellite tracking and observations will be created. FreeFlyer can be compared to STK but is much more versatile at scripting relying less on GUIs and more on the user to integrate native applications with FreeFlyer. FreeFlyer is used in the Flight Dynamics Facility at Goddard Spaceflight Center that supports the [Conjunction Assessment Risk Analysis (CARA)](https://satellitesafety.gsfc.nasa.gov/cara.html). CARA performs probability of collision and risk analysis for all spacecraft w/o a human onboard.

## Plan of Attack
1. FreeFlyer first to build a prototype. Easiest to get something working fast!
2. Incorporate Python tools used to determine real-time observation.
3. Finalize visual using Blender. Python tools previously built will be used as modules for real-time feed.

After the first prototype is built (24 hr grab of TLEs + check for visibility) we will need to update the visual in real-time. This means grabbing information from the Deep Space Network (DSN), Near Earth Network (NEN), and SatNOGS network on current observations. SatNOGS will uniquely require checks for whether a ground station is active and its location. DSN and NEN ground stations are built-into FreeFlyer making FreeFlyer the tool of choice for creating the prototype. 

[DSN and NEN Real-Time](https://scan-now.gsfc.nasa.gov/scan)

[SatNOGS Network](https://network.satnogs.org/)
