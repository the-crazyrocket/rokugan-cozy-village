// Growing the island: the rock outcrop that gives stone every day (systems/quarry.js); the plots themselves are systems/reclaim.js.
import { addBase } from '../../core/content.js';

addBase('props', 'outcrop', { name: 'Rock outcrop', asset: 'outcrop', price: 0, fixed: true });
