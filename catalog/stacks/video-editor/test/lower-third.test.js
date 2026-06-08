import assert from 'assert/strict';
import { buildLowerThird } from '../src/operations/lower-third.js';

assert.deepEqual(
  buildLowerThird({
    title: 'Jane Smith',
    subtitle: 'Founder',
    at: '12.5',
    duration: '4',
    style: 'minimal',
    position: 'bottom-right'
  }),
  {
    title: 'Jane Smith',
    subtitle: 'Founder',
    at: 12.5,
    duration: 4,
    style: 'minimal',
    position: 'bottom-right'
  }
);

assert.deepEqual(
  buildLowerThird({
    title: 'Presenter Name'
  }),
  {
    title: 'Presenter Name',
    subtitle: '',
    at: 0,
    duration: 5,
    style: 'modern',
    position: 'bottom-left'
  }
);

assert.throws(
  () => buildLowerThird({ title: 'Bad Style', style: 'premiere' }),
  /Unknown lower-third style/
);

assert.throws(
  () => buildLowerThird({ title: 'Bad Time', at: '-1' }),
  /Invalid lower-third start time/
);

console.log('lower-third tests passed');
