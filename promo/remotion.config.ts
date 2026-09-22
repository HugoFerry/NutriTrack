import { Config } from '@remotion/cli/config';

// Les images viennent directement de la fiche Play Store : pas de copie à maintenir.
Config.setPublicDir('../store');
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
