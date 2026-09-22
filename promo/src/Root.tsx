import { Composition } from 'remotion';
import { DUREE, FPS, Promo } from './Promo';

export const RemotionRoot = () => (
  <Composition id="NutriTrackPromo" component={Promo} durationInFrames={DUREE} fps={FPS} width={1920} height={1080} />
);
