# Sound

Two simulations, opened from a lessons page (or directly with #sound-waves and #bell-jar):

1. **What Is a Sound Wave?** (`src/sound_waves.jsx`): a loudspeaker or tuning fork
   making a sound wave in air, with frequency and amplitude sliders, a pressure graph
   and labels for wavelength, amplitude, compression and rarefaction.
2. **The Bell Jar Experiment** (`src/bell_jar.jsx`): a buzzer in a bell jar, a vacuum
   pump, and particles of air and of glass (a solid, 8 particles thick) carrying the sound.

Each file has a default export (the lesson, which takes an optional `onBack`) and a
`...Preview` export for a thumbnail card, like `LoudspeakerPreview`.

    npm install
    npm run dev
