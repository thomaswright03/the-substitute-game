// Global three.js settings that must be in place before any colour or material is created, so
// this module is imported first.
//
// The classroom's colours were chosen under three.js r128, which used hex colours as linear
// values. Newer releases convert them from sRGB by default, which would darken every material.
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;
