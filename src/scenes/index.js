// Scene registry (order = navigation order).
import instrument from './instrument.js';
import plasma from './plasma.js';
import cell from './cell.js';
import optics from './optics.js';
import multicollector from './multicollector.js';

export const SCENES = [instrument, plasma, cell, optics, multicollector];
