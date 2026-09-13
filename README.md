# Where's Fly-do?

Ten fruit flies learning to find the striped guy in a crowd.

Each fly sees through an eye with a real fly's facet count and learns with mushroom bodies (the fly brain's learning centers) wired with that fly's real connections, taken from its complete wiring diagram. Land on the striped guy: sugar. Land on anyone else: a zap. Within about ten rounds, the flies go from finding him about 1 time in 8 to about 9 times in 10. You can also make any fly helpless and watch it give up, or **race one**: can you find the striped guy faster than a fruit fly's brain?

**Play it:** [apeabody007.github.io/flydo](https://apeabody007.github.io/flydo/) (phones too), or open `index.html` in any browser. There's nothing to install.

## Why I built this

In 2026, a team from HHMI Janelia, Google Research, and the University of Cambridge published something that had never existed before: a complete wiring diagram of a fruit fly's central nervous system. That's every neuron in its brain, both optic lobes, and the nerve cord that runs its body: about 166,000 neurons and roughly 125 million connections between them.

The way they made it is wild. A single fly's nervous system was cut into thin slabs. Then an ion beam shaved each slab away 8 nanometers at a time, for 13 months, while an electron microscope photographed every newly exposed layer. That produced 160 trillion voxels of images. No team of people could trace every neuron through all of that by hand. Google's part was the AI that does the tracing: flood-filling networks that follow each neuron through the 3D images, plus Neuroglancer, the open-source viewer researchers use to explore these maps.

Maps like this have grown fast:

| Year | Map | Size |
|---|---|---|
| 1986 | The worm *C. elegans*, traced by hand from electron microscope photos | 302 neurons |
| 2020 | Half a fruit fly brain, the "hemibrain" (Janelia and Google) | ~25,000 neurons, 20+ million connections |
| 2024 | A whole adult female fruit fly brain (the FlyWire project) | ~139,000 neurons |
| 2024 | One cubic millimeter of human cortex (Harvard and Google) | ~16,000 neurons, 150 million synapses, 1.4 petabytes of data |
| 2026 | A complete male fruit fly nervous system, brain and nerve cord (Janelia, Google, and Cambridge) | ~166,000 neurons, ~125 million connections |

### Why it matters to me

I've always been drawn to psychology: why we learn, what we fear, what we want, why we do what we do. For most of its history, psychology has had to study the mind from the outside, by watching behavior and working backward. Freud and Jung built whole theories of the inner world with no way to look inside a brain. A wiring diagram is the first real look inside: the physical circuitry that behavior actually runs on.

And a fly isn't as far from us as it sounds. It learns from reward and punishment. It forms memories, and it gets used to things. It courts, fights, and makes decisions. Its learning runs on dopamine, the same chemical that carries reward signals in human brains. The complete map has already let researchers compare male and female brain wiring cell by cell, to see how the circuits behind courtship and aggression differ. And when researchers turned the earlier whole-brain map into a working simulation, it predicted which neurons drive feeding, and experiments confirmed it.

This project is a small version of that idea. Pavlov trained dogs with food. Fly researchers have been training flies with electric shocks since the 1970s and with sugar since the 1980s. Where's Fly-do does the same thing, with the real cells, and the real wiring, that do the learning.

### Where I think this goes

I believe this is the start of something much bigger. Wiring diagrams have gone from 302 neurons to about 166,000 in forty years, and the AI that reads them keeps getting better. A mouse brain has about 70 million neurons, and people are already working out how to map one. A human brain has about 86 billion. That's still a long way off, and a wiring diagram isn't the whole mind: chemistry, timing, and experience matter too. But I think maps like this are how we'll one day understand the brain, and maybe the mind, as fully as it can be understood. The fly is where it starts.

## How a fly works

```
eye: 886 + 893 facets, nearly blind to red
  -> 253 real visual neurons (143 types), each reporting brightness, darkness or stripes from one patch of its eye
    -> 17,890 real synapses onto the visual Kenyon cells: 163 left, 172 right; the APL neuron lets about 5% fire
      -> the cells' real connections onto output neurons that push toward approach or avoid
        -> dopamine: sugar (PAM neurons) or a zap (PPL1 neurons) weakens the connections that were just active
```

Each turn, a fly glances at everyone nearby, flies to whoever looks most like past sugar, looks closely, and lands if that person looks better than what it's used to.

### Numbers from the real fly

All from the [Male CNS connectome](https://male-cns.janelia.org/), pulled by `scripts/extract_counts.py` and `scripts/extract_wiring.py`:

| | Left | Right |
|---|---|---|
| Eye facets (one L2 cell per eye column) | 886 | 893 |
| Visual Kenyon cells (KCγ-d and KCα/β-p) | 163 | 172 |
| APL neurons | 1 | 1 |

Their wiring: 253 visual neurons of 143 types feed the visual Kenyon cells through 17,890 synapses (counting connections of 3 or more synapses). The median cell has 4 visual inputs, and 5 cells get none at all, so they never fire. The cells send 10,816 synapses to output neurons that push toward approaching and 27,458 to output neurons that push toward avoiding.

The whole fly has 166,700 annotated neurons, 4,064 Kenyon cells, 316 PAM and 16 PPL1 dopamine neurons, and 97 mushroom body output neurons.

### How approach and avoid were sorted

Nobody hand-labeled the output neurons. Each one is sorted by the dopamine neurons that connect to it: mostly punishment dopamine (PPL1) means a zap retrains it, and mostly reward dopamine (PAM) means sugar does. That rule alone reproduces the known layout of the mushroom body, with punishment dopamine in the γ1, γ2, α2 and α3 compartments and reward dopamine in the rest, and it cleanly sorts 95% of the visual Kenyon cells' output synapses.

### The crowd

- **The striped guy:** red-and-white stripes, a striped bobble hat, and glasses.
- **Mimes:** black-and-white stripes. Flies barely see red, so to a fly a mime looks almost exactly like the striped guy. Only the hat gives him away.
- **Sailors:** blue-and-white stripes, which look faint to a fly.
- **Referees:** vertical stripes, so the fly has to notice which way the stripes run.
- **Everyone else:** solid shirts, including plenty of red ones that look dark to a fly.

## Psychology and philosophy in the machine

Some of these ideas are built into how the flies work. Others are ways of looking at what they do.

| Idea | Where it shows up |
|---|---|
| **Pavlovian conditioning** | The whole game. Sugar and zaps teach each fly what the striped guy looks like. |
| **Freud's pleasure principle** | Seek pleasure, avoid pain. Every glance is scored on a single scale from avoid to approach. |
| **Learned helplessness** (Seligman and Maier, 1967) | Our first version got zapped so often that it came to expect a zap from everyone, stopped landing, and never found out it could succeed. It found the striped guy 4% of the time, a lot like learned helplessness. **Try it:** the "Make Fly A helpless" button switches a fly back to that rule. It almost stops landing and its success slides; switch it back and it recovers within a few rounds. |
| **Adaptation level** (Helson, 1964) | Part of the fix. A fly now lands on people who look better than what it's used to, not just people who look safe. |
| **Inhibition of return** (Posner and Cohen, 1984) | The other part. Like human attention, a fly skips the last 20 people it checked but can come back to anyone after that. With sparser firing and a few search tweaks, these took the flies from 4% to over 90%. |
| **Punishment** | Harsher zaps never made the flies better. They just made them slower. The gentlest flies did best. |
| **Exploration vs. exploitation** | Going back to people who looked promising is how a fly recovers after flying past him. But a fly that only did that could circle one busy part of the page and never search the rest. So people it hasn't checked yet look a little more appealing, and after 8 rechecks in a row it heads for someone new. In races, the share of give-ups where the fly never even checked him fell from 35% to almost none. |
| **Nature and nurture** | All ten flies have the exact same wiring, copied from one real fly, so every difference between them comes from experience, like identical twins raised apart. Sugar and zaps then rewrite some of those connections. |
| **The uncanny and the shadow** (Freud and Jung) | The mime is the striped guy's double: the same stripes, drained of color. Freud wrote about the eeriness of doubles, and Jung called the dark side of a person their shadow. |
| **"What Is It Like to Be a Bat?"** (Nagel, 1974) | The fly's-eye panel: a gray, blurry world of 1,779 dots where red looks black. |
| **Race the fly** | The fly's search in a race uses its real, learned brain. Its clock is the game's: it takes off after 1.5 seconds and flies from person to person, tuned so races are close. |
| **Sisyphus** (Camus, 1942) | Every time a fly finds him, he hides again and the search starts over. Camus wrote, "One must imagine Sisyphus happy." |

## What's real and what's simplified

**Real:** the cell counts above; which real visual neurons connect to each visual Kenyon cell, and with how many synapses; each Kenyon cell's real connections onto approach and avoid output neurons; flies' weak red vision; sparse Kenyon cell firing; and dopamine weakening whichever Kenyon cell connections were just active (sugar weakens the pull to avoid, punishment weakens the pull to approach). Learning is fast, which fits real flies: they can form a lasting memory from a single training session with sugar.

**Simplified:** the fly looks straight down at a flat page. The optic lobes' processing is replaced by four simple measures per patch, and what each real input neuron reports is picked per neuron: one of those measures, from one small patch of its eye. (Giving neurons wide fields of view blurred the brain's codes, and the flies found him 66% of the time instead of about 90%.) Output neurons are pooled into approach and avoid instead of being simulated one by one.

## Run it

- **Play:** open `index.html`. There's no build step.
- **Prove the flies learn:** `node test/learn.test.js` runs 10 learning flies against 10 identical flies that can't learn.
- **Regenerate the connectome numbers:** `pip install pandas pyarrow`, then `python scripts/extract_counts.py`.
- **Regenerate the wiring:** `python scripts/extract_wiring.py`. The first run downloads the connectome's full connection list (about 1 GB).
- **Redraw the link preview image:** `scripts/social-card.html` draws `social-card.png` from the game's own crowd and eye; the Chrome command is at the top of that file.

## Credits and sources

- Connectome data: Male CNS connectome v1.0 by HHMI Janelia FlyEM, Google Research, and the MRC Laboratory of Molecular Biology and University of Cambridge. CC-BY 4.0. [male-cns.janelia.org](https://male-cns.janelia.org/)
- [Sexual dimorphism in the complete Drosophila male central nervous system connectome](https://www.cell.com/cell/fulltext/S0092-8674(26)00942-6), *Cell* (2026)
- [A connectomics milestone: mapping the complete male fruit fly brain](https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/), Google Research
- [Ten years of neuroscience at Google yields maps of human brain](https://research.google/blog/ten-years-of-neuroscience-at-google-yields-maps-of-human-brain/), Google Research
- [A Drosophila computational brain model reveals sensorimotor processing](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11446845/), *Nature* (2024)
- [Visual input into the Drosophila melanogaster mushroom body](https://www.sciencedirect.com/science/article/pii/S221112472031127X), *Cell Reports* (2020)
- [The neuronal architecture of the mushroom body provides a logic for associative learning](https://elifesciences.org/articles/04577), *eLife* (2014)

Not affiliated with Where's Waldo or its owners.

## License

MIT
