/**
 * @license
 * Copyright 2010-2021 three.js authors
 * SPDX-License-Identifier: MIT
 *
 * From three.js r128, examples/js/shaders/CopyShader.js
 * (https://github.com/mrdoob/three.js/blob/r128/examples/js/shaders/CopyShader.js).
 * Unmodified apart from this header. Full licence text: lib/LICENSE-three.js.txt
 */
( function () {

	/**
 * Full-screen textured quad shader
 */
	var CopyShader = {
		uniforms: {
			'tDiffuse': {
				value: null
			},
			'opacity': {
				value: 1.0
			}
		},
		vertexShader:
  /* glsl */
  `

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,
		fragmentShader:
  /* glsl */
  `

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;

		}`
	};

	THREE.CopyShader = CopyShader;

} )();
