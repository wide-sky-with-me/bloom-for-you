import { BotanicalGarden } from './botanical-garden.js?v=7';
import { ThreeGarden } from './three-garden.js?v=7';
import { ParticleGarden as LegacyGarden } from './legacy-garden.js?v=7';

// Modern browsers always use a real Three scene. The historical renderer exists
// solely for WebGL1-only devices, not as a shell around the Three implementation.
// A Three setup/shader failure is surfaced instead of silently claiming success
// through legacy; the application's existing SVG fallback handles that failure.
export class ParticleGarden {
  constructor(canvas, options = {}) {
    if (canvas.dataset) for (const key of ['studyPrototype', 'studyMode', 'studyPointCore', 'studyPointGrain',
      'studyRenderedMode', 'studyRenderedCore', 'studyRenderedGrain']) delete canvas.dataset[key];
    const context = canvas.getContext('webgl2', {alpha: true, antialias: true,
      powerPreference: 'low-power', preserveDrawingBuffer: false});
    if (context) return new BotanicalGarden(canvas, {...options, context});
    const garden = new LegacyGarden(canvas, options);
    canvas.dataset.engine = 'legacy-webgl1';
    canvas.dataset.style = 'legacy-webgl1';
    canvas.__bloomGarden = garden;
    return garden;
  }
}
export { BotanicalGarden, ThreeGarden, LegacyGarden };
