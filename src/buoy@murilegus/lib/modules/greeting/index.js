// The greeting (GREETING.md): in v0.1 its first run and What's new (§11) — Bu's hello on a
// fresh install with the basics of using Buoy, and after each update what is new and
// fixed, typed in. Start, Wake, Welcome back and Leaving are FEATURES M4 "greeting".
import {GreetingSource} from './source.js';
import adapter from './adapter.js';

export default {
    id: 'greeting',
    title: 'Greeting',
    kinds: ['greeting'],
    noTab: true,        // it opens on its own and goes: no tab in the strip
    source: GreetingSource,
    adapter,
};
