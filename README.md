# DM Toolkit

A home-screen web app for D&D 5e Dungeon Masters: campaigns with a player list, an initiative tracker,
a bestiary of every 5etools creature, and encounters with HP tracking and a difficulty rating
(2024 rules by default, 2014 rules in Settings). Works offline once it has loaded one time.

## Files

```
index.html          app shell
manifest.json       home-screen install info
sw.js               service worker (offline cache)
css/style.css       look and feel (day + night mode)
js/                 app code (updater.js is the in-app bestiary updater) (main.js is the entry point; pages/ holds each screen)
data/bestiary.json  creatures built from 5etools (3,700+, newest book wins for duplicates)
icons/              app icons
tools/              build_bestiary.py - rebuilds data/bestiary.json from 5etools
```

## Host it on GitHub Pages

1. Put the contents of this folder at the root of a repository.
2. Settings → Pages → deploy from the `main` branch, root folder.
3. Open the site on your phone and use "Add to Home Screen".

## Update the creature data

**In the app:** Settings → Bestiary → *Update monsters from 5etools*. It downloads the latest data and keeps it on that
device (needs a connection once). *Use built-in list* goes back to the file shipped with the app.

**For everyone who uses your site (optional):**

```
python3 tools/build_bestiary.py
```

This downloads the latest 5etools data, merges duplicates (a creature reprinted in a newer book replaces the
older one), and rewrites `data/bestiary.json`. Then change `VERSION` at the top of `sw.js`
(for example `dm-toolkit-v2`) so devices that already installed the app pick up the new data.

## Difficulty rules

* 2024: add up the XP of every creature and compare with the party's per-character budget (Low / Moderate / High).
* 2014: add up the XP, multiply by the number-of-monsters multiplier (shifted for parties under 3 or over 5),
  and compare with the Easy / Medium / Hard / Deadly thresholds.

Creatures with no CR (some summons and NPCs) count as 0 XP.

## Campaign setting: monster initiative

Each campaign (new or Edit popup) has *Monster initiative*: each creature rolls on its own (default), the same creature
shares one roll (all spiders together, giant spiders separate), or all monsters share one roll. Rolling, typing a value
and sorting all follow it.
