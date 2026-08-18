import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sparklineDomain,
  nwsToWmo,
  nwsTempToDisp,
  msToDisp,
  haversineMi,
  isLikelyUS,
} from './lib/core-math.mjs';

test('sparklineDomain uses data range', () => {
  assert.deepEqual(sparklineDomain([10, 20, 30]), { min: 10, max: 30 });
});

test('sparklineDomain honors explicit domain', () => {
  assert.deepEqual(sparklineDomain([10, 20], { domain: { min: 0, max: 100 } }), {
    min: 0,
    max: 100,
  });
});

test('sparklineDomain expands a short span', () => {
  const d = sparklineDomain([50, 51], { minSpan: 10 });
  assert.equal(d.max - d.min, 10);
  assert.equal((d.min + d.max) / 2, 50.5);
});

test('nwsToWmo maps common phrases', () => {
  assert.equal(nwsToWmo('Severe Thunderstorm Warning'), 95);
  assert.equal(nwsToWmo('Slight Chance Thunderstorms'), 80);
  assert.equal(nwsToWmo('Light Snow'), 71);
  assert.equal(nwsToWmo('Rain Showers'), 63);
  assert.equal(nwsToWmo('Chance Rain'), 61);
  assert.equal(nwsToWmo('Patchy Fog'), 45);
  assert.equal(nwsToWmo('Sunny'), 0);
  assert.equal(nwsToWmo('Mostly Sunny'), 2);
});

test('nwsTempToDisp converts between F and C', () => {
  assert.equal(nwsTempToDisp(32, 'F', 'C'), 0);
  assert.equal(nwsTempToDisp(0, 'C', 'F'), 32);
  assert.equal(nwsTempToDisp(70, 'F', 'F'), 70);
  assert.equal(nwsTempToDisp(null, 'F', 'F'), null);
});

test('msToDisp converts to mph or km/h', () => {
  assert.equal(msToDisp(10, 'F'), 22);
  assert.equal(msToDisp(10, 'C'), 36);
  assert.equal(msToDisp(null, 'F'), null);
});

test('haversineMi is zero at the same point', () => {
  assert.equal(haversineMi(42.97, -85.67, 42.97, -85.67), 0);
});

test('haversineMi is about 69 miles per degree of latitude', () => {
  const mi = haversineMi(0, 0, 1, 0);
  assert.ok(mi > 68.5 && mi < 69.5, `got ${mi}`);
});

test('isLikelyUS uses country then a lon/lat box', () => {
  assert.equal(isLikelyUS({ country: 'US', lat: 0, lon: 0 }), true);
  assert.equal(isLikelyUS({ country: 'CA', lat: 45, lon: -75 }), false);
  assert.equal(isLikelyUS({ lat: 42.97, lon: -85.67 }), true);
  assert.equal(isLikelyUS({ lat: 51.5, lon: -0.1 }), false);
});
