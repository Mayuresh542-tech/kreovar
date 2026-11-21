import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('CapCut-Grade Canvas Manipulation & Compositor Preview Suite', () => {

  test('1. Dynamic Cursor Rotation Mapping', () => {
    function getRotatedCursor(baseAngleDeg, clipRotationDeg) {
      const totalAngle = (baseAngleDeg + clipRotationDeg) % 180;
      const normalized = totalAngle < 0 ? totalAngle + 180 : totalAngle;
      if (normalized >= 22.5 && normalized < 67.5) return 'nesw-resize';
      if (normalized >= 67.5 && normalized < 112.5) return 'ns-resize';
      if (normalized >= 112.5 && normalized < 157.5) return 'nwse-resize';
      return 'ew-resize';
    }

    // At 0 deg rotation
    assert.equal(getRotatedCursor(45, 0), 'nesw-resize'); // NE / SW handle
    assert.equal(getRotatedCursor(135, 0), 'nwse-resize'); // NW / SE handle
    assert.equal(getRotatedCursor(0, 0), 'ew-resize'); // E / W handle
    assert.equal(getRotatedCursor(90, 0), 'ns-resize'); // N / S handle

    // When clip is rotated 90 deg
    assert.equal(getRotatedCursor(45, 90), 'nwse-resize');
    assert.equal(getRotatedCursor(135, 90), 'nesw-resize');
    assert.equal(getRotatedCursor(0, 90), 'ns-resize');

    // When clip is rotated 45 deg
    assert.equal(getRotatedCursor(0, 45), 'nesw-resize');
  });

  test('2. Cardinal Angle Snapping Mechanics', () => {
    const snapAngles = [0, 45, 90, 135, 180, -45, -90, -135, -180];
    const snapThreshold = 3.5;

    function snapRotation(rawDeg) {
      let normRot = (((rawDeg + 180) % 360) + 360) % 360 - 180;
      const snapTarget = snapAngles.find((a) => Math.abs(normRot - a) <= snapThreshold);
      if (snapTarget !== undefined) normRot = snapTarget;
      return Math.round(normRot * 10) / 10;
    }

    assert.equal(snapRotation(1.5), 0);
    assert.equal(snapRotation(-2.1), 0);
    assert.equal(snapRotation(88.5), 90);
    assert.equal(snapRotation(91.2), 90);
    assert.equal(snapRotation(43.8), 45);
    assert.equal(snapRotation(-92.0), -90);
    assert.equal(snapRotation(178.5), 180);

    // Beyond threshold: no snap
    assert.equal(snapRotation(12.0), 12.0);
    assert.equal(snapRotation(75.5), 75.5);
  });

  test('3. Visual Center-Cross Snap Math with Hysteresis Break-Force', () => {
    const canvasWidth = 800;
    const snapThresholdPx = 10;
    const breakThresholdPx = 16;

    let snapActive = false;
    function computeSnapX(rawX) {
      let nextX = rawX;
      if (snapActive) {
        if (Math.abs(rawX) * canvasWidth > breakThresholdPx) {
          snapActive = false;
          nextX = rawX;
        } else {
          nextX = 0;
        }
      } else {
        if (Math.abs(rawX) * canvasWidth <= snapThresholdPx) {
          snapActive = true;
          nextX = 0;
        }
      }
      return { nextX, snapActive };
    }

    // Free moving: rawX = 0.05 (40px)
    let res = computeSnapX(0.05);
    assert.equal(res.snapActive, false);
    assert.equal(res.nextX, 0.05);

    // Enters snap zone: rawX = 0.01 (8px <= 10px) -> snaps to 0!
    res = computeSnapX(0.01);
    assert.equal(res.snapActive, true);
    assert.equal(res.nextX, 0);

    // Stays within hysteresis well: rawX = 0.015 (12px > 10px but <= 16px) -> remains snapped!
    res = computeSnapX(0.015);
    assert.equal(res.snapActive, true);
    assert.equal(res.nextX, 0);

    // Breaks free: rawX = 0.025 (20px > 16px) -> unsnaps cleanly!
    res = computeSnapX(0.025);
    assert.equal(res.snapActive, false);
    assert.equal(res.nextX, 0.025);
  });

  test('4. 4-Corner Proportional Scale Calculation', () => {
    function computeCornerScale(initialScale, startDist, currentDist) {
      const scaleRatio = currentDist / Math.max(10, startDist);
      const nextScale = Math.max(0.05, Math.min(10, initialScale * scaleRatio));
      return Math.round(nextScale * 1000) / 1000;
    }

    // Drag outward: distance doubles -> scale doubles
    assert.equal(computeCornerScale(1.0, 100, 200), 2.0);

    // Drag inward: distance halves -> scale halves
    assert.equal(computeCornerScale(1.0, 100, 50), 0.5);

    // Boundary clamp at 10x
    assert.equal(computeCornerScale(5.0, 100, 500), 10.0);

    // Boundary clamp at 0.05x
    assert.equal(computeCornerScale(0.1, 100, 10), 0.05);
  });

  test('5. 9:16 Vertical Safe Zone Geometry (TikTok & Reels)', () => {
    const W = 1080;
    const H = 1920;

    const topDeadzoneHeight = H * 0.12; // 230.4px (~12%)
    const bottomDeadzoneHeight = H * 0.224; // 430.08px (~22.4%)
    const rightActionRailWidth = W * 0.176; // 190.08px (~17.6%)
    const leftMargin = W * 0.05; // 54px (5%)

    const activeSafeWidth = W - leftMargin - rightActionRailWidth; // 1080 - 54 - 190.08 = 835.92px (~820px)
    const activeSafeHeight = H - topDeadzoneHeight - bottomDeadzoneHeight; // 1920 - 230.4 - 430.08 = 1259.52px (~1260px)

    assert.ok(Math.abs(activeSafeWidth - 836) < 2);
    assert.ok(Math.abs(activeSafeHeight - 1260) < 2);
  });

  test('6. Scrubbing State Lifecycle & Audio Muting Invariants', () => {
    let audioGain = 1.0;
    let isScrubbing = false;

    function setScrubbing(state) {
      isScrubbing = state;
      if (state) {
        audioGain = 0.0; // Instantly silence audio during scrub to eliminate clicks/chirps
      } else {
        audioGain = 1.0; // Restore upon scrub release
      }
    }

    setScrubbing(true);
    assert.equal(isScrubbing, true);
    assert.equal(audioGain, 0.0, 'Audio gain must be 0 while scrubbing');

    setScrubbing(false);
    assert.equal(isScrubbing, false);
    assert.equal(audioGain, 1.0, 'Audio gain must be restored upon release');
  });

});
